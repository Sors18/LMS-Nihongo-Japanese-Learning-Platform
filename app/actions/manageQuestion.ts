"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { QuestionType } from "@prisma/client";

const VALID_TYPES: QuestionType[] = [
  QuestionType.VOCAB_CHOICE,
  QuestionType.FILL_PARTICLE,
  QuestionType.LISTENING,
];

type ActionOk<T = unknown> = { ok: true } & T;
type ActionFail = { ok: false; error: string };
type ActionResult<T = unknown> = ActionOk<T> | ActionFail;

function authError(e: unknown): ActionFail {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Unauthorized") return { ok: false, error: "Unauthorized — vui lòng đăng nhập" };
  if (msg === "Forbidden") return { ok: false, error: "Forbidden — chỉ ADMIN mới thực hiện được" };
  return { ok: false, error: msg };
}

function parseId(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeOptions(raw: unknown): string[] | null {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  const cleaned = (arr as unknown[]).map((o) => String(o ?? "").trim()).filter((s) => s !== "");
  // Bỏ trùng nhưng giữ thứ tự
  return [...new Set(cleaned)];
}

type ValidatedQuestion = { ok: true; content: string; options: string[]; correct: string } | { ok: false; error: string };

function validateQuestionFields(input: { content?: unknown; options?: unknown; correct_answer?: unknown }): ValidatedQuestion {
  const content = String(input.content ?? "").trim();
  if (!content) return { ok: false, error: "Nội dung câu hỏi không được để trống" };
  if (content.length > 2000) return { ok: false, error: "Nội dung quá dài (tối đa 2000 ký tự)" };

  const options = normalizeOptions(input.options);
  if (!options) return { ok: false, error: "options phải là mảng JSON (VD [\"A\",\"B\",\"C\"])" };
  if (options.length < 2) return { ok: false, error: "Cần ít nhất 2 lựa chọn" };
  if (options.length > 6) return { ok: false, error: "Tối đa 6 lựa chọn" };
  if (options.some((o) => o.length > 500)) return { ok: false, error: "Mỗi lựa chọn tối đa 500 ký tự" };

  const correct = String(input.correct_answer ?? "").trim();
  if (!correct) return { ok: false, error: "Đáp án đúng không được để trống" };
  if (!options.includes(correct)) return { ok: false, error: "Đáp án đúng phải nằm trong danh sách lựa chọn" };

  return { ok: true, content, options, correct };
}

// ---------------------------------------------------------------------------
// updateQuestionAction — ADMIN sửa nội dung / lựa chọn / đáp án
// ---------------------------------------------------------------------------
export async function updateQuestionAction(input: {
  questionId: unknown;
  content: unknown;
  options: unknown;
  correct_answer: unknown;
}): Promise<ActionResult<{ question: { id: number; content: string; options: string[]; correct_answer: string } }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return authError(e);
  }
  const qid = parseId(input.questionId);
  if (!qid) return { ok: false, error: "questionId không hợp lệ" };

  const v = validateQuestionFields(input);
  if (!v.ok) return { ok: false, error: v.error };

  try {
    const existing = await prisma.question.findUnique({ where: { id: qid } });
    if (!existing) return { ok: false, error: `Không tìm thấy câu hỏi #${qid}` };
    const updated = await prisma.question.update({
      where: { id: qid },
      data: { content: v.content, options: v.options, correct_answer: v.correct },
    });
    revalidatePath("/admin/questions");
    revalidatePath(`/video/${existing.video_id}`);
    revalidatePath(`/test/${existing.video_id}`);
    return {
      ok: true,
      question: { id: updated.id, content: updated.content, options: v.options, correct_answer: updated.correct_answer },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// deleteQuestionAction — ADMIN xóa 1 câu
// ---------------------------------------------------------------------------
export async function deleteQuestionAction(questionId: unknown): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return authError(e);
  }
  const qid = parseId(questionId);
  if (!qid) return { ok: false, error: "questionId không hợp lệ" };
  try {
    const existing = await prisma.question.findUnique({ where: { id: qid } });
    if (!existing) return { ok: false, error: `Không tìm thấy câu hỏi #${qid}` };
    await prisma.question.delete({ where: { id: qid } });
    revalidatePath("/admin/questions");
    revalidatePath(`/video/${existing.video_id}`);
    revalidatePath(`/test/${existing.video_id}`);
    return { ok: true, deleted: 1 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// cleanJunkQuestions — ADMIN dọn câu rác của 1 video:
// sub thuần Việt (không chữ Nhật) + câu hỏi tên người (bộ lọc mới trong generateTest
// không áp dụng hồi tố, nên đề cũ cần dọn 1 lần).
// ---------------------------------------------------------------------------
export async function cleanJunkQuestions(
  videoId: unknown
): Promise<ActionResult<{ deleted: number; deletedIds: number[]; total: number }>> {
  try {
    await requireAdmin();
  } catch (e) {
    return authError(e);
  }
  const vid = parseId(videoId);
  if (!vid) return { ok: false, error: "videoId không hợp lệ" };
  try {
    const { isJunkQuestion, loadPersonWordSet } = await import("@/lib/questionQuality");
    const personWords = await loadPersonWordSet();
    const rows = await prisma.question.findMany({ where: { video_id: vid }, orderBy: { id: "asc" } });
    const junkIds = rows
      .filter((q) =>
        isJunkQuestion(
          { id: q.id, question_type: String(q.question_type), content: q.content, options: q.options, correct_answer: q.correct_answer },
          personWords
        )
      )
      .map((q) => q.id);
    if (junkIds.length === 0) return { ok: true, deleted: 0, deletedIds: [], total: rows.length };
    await prisma.question.deleteMany({ where: { id: { in: junkIds } } });
    revalidatePath("/admin/questions");
    revalidatePath(`/video/${vid}`);
    revalidatePath(`/test/${vid}`);
    return { ok: true, deleted: junkIds.length, deletedIds: junkIds, total: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// NOTE: không export VALID_TYPES (hay bất kỳ object nào) khỏi file "use server" —
// Next.js chỉ cho export async function, export object sẽ sập build/action như trên.
