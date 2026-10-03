"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseSubtitleInput } from "@/lib/subtitleParser";
import { expandVocabularyForRows } from "@/app/actions/extractVocab";
import { syncGrammarForSubtitles } from "@/app/actions/extractGrammar";
import type { StageProgressFn } from "@/lib/gemini";
export type InsertSubtitleInput = {
  videoId: number;
  subtitleText: string;
  mode: "replace" | "append";
};

export async function insertSubtitleAction(input: InsertSubtitleInput) {
  return insertSubtitleCore(input);
}

/**
 * Danh sách phụ đề hiện tại của video (cho editor sửa từng dòng).
 */
export async function listSubtitlesAction(videoId: number) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false as const, error: "Forbidden — chỉ ADMIN mới xem được phụ đề" };
  }
  if (!videoId || Number.isNaN(videoId)) return { ok: false as const, error: "Chưa chọn video" };
  const subtitles = await prisma.subtitle.findMany({
    where: { video_id: videoId },
    orderBy: { start_time_ms: "asc" },
    select: { id: true, start_time_ms: true, end_time_ms: true, raw_text: true, translation: true },
  });
  return { ok: true as const, subtitles };
}

export type EditableSubtitle = {
  start_time_ms: number;
  end_time_ms: number;
  raw_text: string;
  translation?: string | null;
};

/**
 * Lưu toàn bộ phụ đề đã sửa: validate → xóa cũ → chèn mới (giữ video, không đụng vocab/grammar).
 * An toàn vì Subtitle không có bảng con tham chiếu.
 */
export async function updateSubtitlesAction(videoId: number, subtitles: EditableSubtitle[]) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false as const, error: "Forbidden — chỉ ADMIN mới sửa được phụ đề" };
  }
  if (!videoId || Number.isNaN(videoId)) return { ok: false as const, error: "Chưa chọn video" };
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) return { ok: false as const, error: `Không tìm thấy video id=${videoId}` };
  if (!Array.isArray(subtitles)) return { ok: false as const, error: "Dữ liệu phụ đề không hợp lệ" };

  const cleaned: EditableSubtitle[] = [];
  for (let idx = 0; idx < subtitles.length; idx++) {
    const s = subtitles[idx];
    const start = Math.floor(Number(s?.start_time_ms));
    const end = Math.floor(Number(s?.end_time_ms));
    const text = String(s?.raw_text ?? "").trim();
    const translation = String(s?.translation ?? "").trim();
    if (!Number.isFinite(start) || start < 0) return { ok: false as const, error: `Dòng ${idx + 1}: giờ bắt đầu không hợp lệ` };
    if (!Number.isFinite(end) || end <= start) return { ok: false as const, error: `Dòng ${idx + 1}: giờ kết thúc phải sau giờ bắt đầu` };
    if (!text) return { ok: false as const, error: `Dòng ${idx + 1}: nội dung trống` };
    cleaned.push({ start_time_ms: start, end_time_ms: end, raw_text: text.slice(0, 2000), translation: translation ? translation.slice(0, 2000) : null });
  }
  cleaned.sort((a, b) => a.start_time_ms - b.start_time_ms);

  await prisma.subtitle.deleteMany({ where: { video_id: videoId } });
  if (cleaned.length > 0) {
    await prisma.subtitle.createMany({
      data: cleaned.map((s) => ({
        video_id: videoId,
        start_time_ms: s.start_time_ms,
        end_time_ms: s.end_time_ms,
        raw_text: s.raw_text,
        translation: s.translation ?? null,
      })),
    });
  }

  revalidatePath(`/video/${videoId}`);
  revalidatePath("/");
  revalidatePath("/admin/subtitle");
  return { ok: true as const, count: cleaned.length, videoId };
}

/**
 * Core thêm phụ đề — chỉ quét vocab/grammar trên dòng MỚI thêm.
 * Route SSE truyền onProgress để báo phần trăm.
 */
export async function insertSubtitleCore(input: InsertSubtitleInput, onProgress?: StageProgressFn) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false as const, error: "Forbidden — chỉ ADMIN mới chèn được phụ đề" };
  }
  if (!input.videoId || Number.isNaN(input.videoId)) return { ok: false as const, error: "Chưa chọn video" };
  if (!input.subtitleText.trim()) return { ok: false as const, error: "Chưa dán nội dung phụ đề" };
  if (!["replace", "append"].includes(input.mode)) return { ok: false as const, error: "Mode không hợp lệ" };

  const video = await prisma.video.findUnique({ where: { id: input.videoId } });
  if (!video) return { ok: false as const, error: `Không tìm thấy video id=${input.videoId}` };

  const parsed = parseSubtitleInput(input.subtitleText);
  if (parsed.length === 0) return { ok: false as const, error: "Không parse được phụ đề — kiểm tra định dạng SRT/VTT hoặc mỗi dòng 1 câu" };
  onProgress?.("parse", 1, 1);

  if (input.mode === "replace") {
    await prisma.subtitle.deleteMany({ where: { video_id: input.videoId } });
  }

  await prisma.subtitle.createMany({
    data: parsed.map((s) => ({
      video_id: input.videoId,
      start_time_ms: s.start_time_ms,
      end_time_ms: s.end_time_ms,
      raw_text: s.raw_text,
      translation: s.translation ?? null,
    })),
  });
  onProgress?.("save", 1, 1);

  // Lấy đúng các dòng vừa thêm (id mới nhất) để expand scoped
  const newRows = (
    await prisma.subtitle.findMany({
      where: { video_id: input.videoId },
      orderBy: { id: "desc" },
      take: parsed.length,
      select: { id: true, raw_text: true, translation: true, start_time_ms: true },
    })
  ).reverse();

  // Mở rộng thư viện vocab/grammar chỉ trên dòng mới (không block lỗi chính)
  let vocabAdded = 0;
  let grammarSynced = 0;
  try {
    const [vocabRes, grammarRes] = await Promise.all([
      expandVocabularyForRows(newRows, onProgress),
      syncGrammarForSubtitles(input.videoId, newRows, onProgress),
    ]);
    vocabAdded = vocabRes.added;
    grammarSynced = grammarRes.addedGrammar;
    console.log(`[expandLibrary] video ${input.videoId}: vocab +${vocabRes.added}/${vocabRes.totalDistinct} grammar +${grammarRes.addedGrammar}`);
  } catch (e) {
    console.warn("[expandLibrary] failed", e);
  }

  revalidatePath(`/video/${input.videoId}`);
  revalidatePath("/");
  revalidatePath("/admin/subtitle");
  return { ok: true as const, count: parsed.length, videoId: input.videoId, vocabAdded, grammarSynced };
}
