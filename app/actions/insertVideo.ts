"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { pairBilingualLines } from "@/lib/bilingual";
import { expandVocabularyForRows } from "@/app/actions/extractVocab";
import { syncGrammarForSubtitles } from "@/app/actions/extractGrammar";
import type { StageProgressFn } from "@/lib/gemini";
import type { Level, VideoCategory } from "@prisma/client";

function extractYoutubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (u.searchParams.get("v")) {
      const v = u.searchParams.get("v")!;
      if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
    const m = s.match(/(?:youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  } catch {}
  const m2 = s.match(/([a-zA-Z0-9_-]{11})/);
  return m2 ? m2[1] : null;
}

function splitTranscriptToSubtitles(raw: string): Array<{ start_time_ms: number; end_time_ms: number; raw_text: string; translation: string | null }> {
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  // Ghép cặp song ngữ JP/VI trước (dòng Việt gắn vào câu Nhật ngay trên)
  const pairs = pairBilingualLines(
    lines.map((l) => l.replace(/^\d{1,2}:\d{2}(:\d{2})?\s*[-–]?\s*/, "").trim()).filter(Boolean)
  );
  if (pairs.length === 0) return [];
  const perLineMs = 3000;
  return pairs.map((p, i) => ({
    start_time_ms: i * perLineMs,
    end_time_ms: (i + 1) * perLineMs - 200,
    raw_text: p.jp,
    translation: p.vi,
  }));
}

export type InsertVideoInput = {
  youtubeUrlOrId: string;
  title: string;
  level: "N5" | "N4" | "N3" | "N2" | "N1";
  category?: "SHORT" | "KAIWA" | "SONG" | "ANIME";
  /** Tên bộ anime — các tập cùng bộ nhập cùng series để gom ở /anime/[series] */
  series?: string;
  duration?: number;
  transcript?: string;
};

export async function insertVideoAction(input: InsertVideoInput) {
  return insertVideoCore(input);
}

/**
 * Core thêm video — expand vocab/grammar scoped trên transcript mới.
 * Route SSE truyền onProgress để báo phần trăm.
 */
export async function insertVideoCore(input: InsertVideoInput, onProgress?: StageProgressFn) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false as const, error: "Forbidden — chỉ ADMIN mới thêm được video" };
  }
  const youtube_id = extractYoutubeId(input.youtubeUrlOrId);
  if (!youtube_id) return { ok: false as const, error: "Không parse được YouTube ID — dán link dạng https://www.youtube.com/watch?v=XXXX hoặc chỉ ID 11 ký tự" };
  if (!input.title.trim()) return { ok: false as const, error: "Thiếu tiêu đề" };
  if (!["N5", "N4", "N3", "N2", "N1"].includes(input.level)) return { ok: false as const, error: "Level không hợp lệ" };
  const validCategories = ["SHORT", "KAIWA", "SONG", "ANIME"] as const;
  if (input.category && !(validCategories as readonly string[]).includes(input.category)) {
    return { ok: false as const, error: "Category không hợp lệ" };
  }
  const category = input.category && (validCategories as readonly string[]).includes(input.category) ? input.category : "SHORT";
  const series = input.series?.trim() ? input.series.trim().slice(0, 255) : null;

  const exists = await prisma.video.findUnique({ where: { youtube_id } });
  if (exists) return { ok: false as const, error: `Video đã tồn tại: id=${exists.id} title=${exists.title}` };

  const duration = input.duration && input.duration > 0 ? Math.floor(input.duration) : 300;
  const levelValue = input.level as unknown as Level;
  const categoryValue = category as unknown as VideoCategory;
  const video = await prisma.video.create({
    data: { youtube_id, title: input.title.trim(), level: levelValue, category: categoryValue, duration, series },
  });
  onProgress?.("save", 1, 1);

  let subtitleCount = 0;
  let vocabAdded = 0;
  let grammarSynced = 0;
  if (input.transcript && input.transcript.trim()) {
    const subs = splitTranscriptToSubtitles(input.transcript);
    if (subs.length > 0) {
      await prisma.subtitle.createMany({
        data: subs.map((s) => ({ video_id: video.id, start_time_ms: s.start_time_ms, end_time_ms: s.end_time_ms, raw_text: s.raw_text, translation: s.translation })),
      });
      subtitleCount = subs.length;
      const newRows = (
        await prisma.subtitle.findMany({
          where: { video_id: video.id },
          orderBy: { id: "desc" },
          take: subs.length,
          select: { id: true, raw_text: true, translation: true, start_time_ms: true },
        })
      ).reverse();
      // Mở rộng thư viện vocab/grammar chỉ trên transcript vừa thêm
      try {
        const [vocabRes, grammarRes] = await Promise.all([
          expandVocabularyForRows(newRows, onProgress),
          syncGrammarForSubtitles(video.id, newRows, onProgress),
        ]);
        vocabAdded = vocabRes.added;
        grammarSynced = grammarRes.addedGrammar;
      } catch (e) {
        console.warn("[expandLibrary insertVideo] failed", e);
      }
    }
  }

  revalidatePath("/");
  revalidatePath(`/video/${video.id}`);
  revalidatePath("/admin/insert");
  return { ok: true as const, videoId: video.id, youtube_id, subtitleCount, vocabAdded, grammarSynced };
}
