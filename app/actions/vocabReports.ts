"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAdmin } from "@/lib/auth";

const ISSUES = ["READING", "MEANING", "KIND", "OTHER"] as const;
export type ReportIssue = (typeof ISSUES)[number];
export type ReportStatus = "PENDING" | "RESOLVED" | "REJECTED";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * User báo lỗi từ vựng (cần đăng nhập). Chống spam: cùng user + word + PENDING → gộp, không tạo mới.
 */
export async function createVocabReport(input: {
  word: string;
  reading?: string;
  currentMeaning?: string;
  vocabId?: number | null;
  issue: string;
  note?: string;
}): Promise<Result<{ id: number; merged?: boolean }>> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { ok: false, error: "Hãy đăng nhập để báo lỗi" };

  const word = String(input.word ?? "").trim();
  if (!word) return { ok: false, error: "Thiếu từ cần báo lỗi" };
  const issue = String(input.issue ?? "OTHER").toUpperCase();
  if (!(ISSUES as readonly string[]).includes(issue)) return { ok: false, error: "Loại lỗi không hợp lệ" };
  const note = String(input.note ?? "").trim().slice(0, 500);
  const vocabId = Number(input.vocabId ?? 0) || null;

  try {
    const dup = await prisma.vocabReport.findFirst({
      where: { word, user_id: user.id, status: "PENDING" },
      select: { id: true },
    });
    if (dup) {
      await prisma.vocabReport.update({
        where: { id: dup.id },
        data: {
          issue,
          note: note || undefined,
          reading: String(input.reading ?? ""),
          current_meaning: String(input.currentMeaning ?? "").slice(0, 500),
          vocab_id: vocabId,
        },
      });
      return { ok: true, id: dup.id, merged: true };
    }
    const created = await prisma.vocabReport.create({
      data: {
        word,
        reading: String(input.reading ?? ""),
        current_meaning: String(input.currentMeaning ?? "").slice(0, 500),
        vocab_id: vocabId,
        user_id: user.id,
        issue,
        note,
      },
    });
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Đếm báo lỗi chờ duyệt — hiện badge ở menu admin. */
export async function countPendingReports(): Promise<number> {
  try {
    await requireAdmin();
  } catch {
    return 0;
  }
  try {
    return await prisma.vocabReport.count({ where: { status: "PENDING" } });
  } catch {
    return 0;
  }
}

export type ReportRow = {
  id: number;
  word: string;
  reading: string;
  current_meaning: string;
  vocab_id: number | null;
  user_id: string | null;
  issue: string;
  note: string;
  status: string;
  created_at: Date;
};

/** Admin xem danh sách báo lỗi (mới nhất trước, PENDING lên đầu). */
export async function listVocabReports(status?: string): Promise<Result<{ reports: ReportRow[] }>> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Chỉ ADMIN mới xem được" };
  }
  const st = String(status ?? "PENDING").toUpperCase();
  const where = st === "ALL" ? {} : { status: st as ReportStatus };
  try {
    const rows = await prisma.vocabReport.findMany({
      where,
      orderBy: [{ status: "asc" }, { id: "desc" }],
      take: 200,
    });
    return { ok: true, reports: rows as ReportRow[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Admin đánh dấu đã xử lý / bỏ qua. */
export async function setReportStatus(id: number, status: string): Promise<Result> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Chỉ ADMIN mới thực hiện được" };
  }
  const st = String(status ?? "").toUpperCase();
  if (!["RESOLVED", "REJECTED", "PENDING"].includes(st)) return { ok: false, error: "Trạng thái không hợp lệ" };
  const rid = Math.floor(Number(id));
  if (!rid || rid <= 0) return { ok: false, error: "Thiếu id" };
  try {
    await prisma.vocabReport.update({ where: { id: rid }, data: { status: st as ReportStatus } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
