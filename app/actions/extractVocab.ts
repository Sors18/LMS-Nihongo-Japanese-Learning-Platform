"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import { getCachedTokens } from "@/lib/cache";
import { isSkippableToken, getDedupKey, mergeMixedScriptTokens } from "@/lib/vocabFilter";
import { getProperNounKind, buildProperNounMeaning } from "@/lib/vocabFilter";
import type { ProperNounKind } from "@/lib/vocabFilter";
import type { KuromojiToken } from "@/lib/kuromoji";
import { resolveVocabMeanings } from "@/lib/gemini";
import { lookupCollocation, mergeCollocations } from "@/lib/collocations";
import { sampleWithTranslation } from "@/lib/bilingual";
import { normalizeMeaningVi, formatReading } from "@/lib/meaningVi";
import { getKnownProperReading, buildKnownProperMeaning, resolveReading } from "@/lib/properNames";
import type { ChunkProgressFn, StageProgressFn } from "@/lib/gemini";
import type { Level } from "@prisma/client";
const LEVEL_ORDER = ["N5", "N4", "N3", "N2", "N1"] as const;
type LevelStr = typeof LEVEL_ORDER[number];
function getAllowedLevels(level: string | null | undefined): Set<string> | null {
  if (!level || !LEVEL_ORDER.includes(level as LevelStr)) return null;
  if (level === "N5" || level === "N4") return new Set<string>(["N5", "N4", "N3", "N2", "N1"]);
  if (level === "N3" || level === "N2") return new Set<string>(["N4", "N3", "N2", "N1"]);
  if (level === "N1") return new Set<string>(["N2", "N1"]);
  return null;
}
// Simple in-memory cache for Jisho lookups (per server lifetime)
const jishoCache = new Map<string, { meaning: string; level: string | null; isCommon: boolean } | null>();
// Cache token hóa theo dòng phụ đề để trích xuất lại không tách từ trùng
const tokenCache = new Map<string, KuromojiToken[]>();
function cacheKey(subId: number, text: string): string {
  return `${subId}:${text.length}:${text.slice(0, 40)}`;
}
// Nghĩa placeholder do bulk-insert cũ ghi khi Jisho fail — enrich sẽ thử Gemini lại
const PLACEHOLDER_RE = /Tên riêng\/ ?katakana:|\(từ mới|\(từ trong|\(chưa có trong từ điển\)|— cần bổ sung/;

function jlptToLevel(jlpt: string[]): string | null {
  // jisho returns ["jlpt-n5"] etc — pick easiest (highest N number is easier)
  const order: Record<string, number> = { "jlpt-n5": 5, "jlpt-n4": 4, "jlpt-n3": 3, "jlpt-n2": 2, "jlpt-n1": 1 };
  let best: string | null = null;
  let bestRank = 0;
  for (const j of jlpt) {
    const rank = order[j] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = j.replace("jlpt-", "").toUpperCase();
    }
  }
  return best;
}

async function fetchJisho(word: string): Promise<{ meaning: string; level: string | null; isCommon: boolean } | null> {
  const key = word.trim();
  if (!key) return null;
  if (jishoCache.has(key)) return jishoCache.get(key) ?? null;
  try {
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(key)}`;
    const res = await fetch(url, { next: { revalidate: 86400 } } as unknown as RequestInit);
    if (!res.ok) {
      jishoCache.set(key, null);
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{
        jlpt?: string[];
        is_common?: boolean;
        senses?: Array<{ english_definitions?: string[] }>;
        japanese?: Array<{ word?: string; reading?: string }>;
      }>;
    };
    // Ưu tiên entry khớp chính xác từ/reading; fallback mới lấy [0] (tránh Jisho trả từ gần đúng)
    const data = json.data ?? [];
    const first = data.find((d) => d.japanese?.some((j) => j.word === key || j.reading === key)) ?? data[0];
    if (!first) {
      jishoCache.set(key, null);
      return null;
    }
    const senses = first.senses ?? [];
    const defs: string[] = [];
    for (const s of senses.slice(0, 2)) {
      const eng = s.english_definitions?.slice(0, 3).join(", ");
      if (eng) defs.push(eng);
    }
    const enMeaning = defs.join(" / ").slice(0, 180) || "";
    if (!enMeaning) {
      jishoCache.set(key, null);
      return null;
    }
    // Dịch EN -> VI qua MyMemory (nhanh, free) — CHỈ lấy tiếng Việt, bỏ EN.
    // Không dịch được → null để caller bỏ qua (Gemini là nguồn chính).
    let viMeaning: string | null = null;
    try {
      const tRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(enMeaning)}&langpair=en|vi`, { next: { revalidate: 86400 } } as unknown as RequestInit);
      if (tRes.ok) {
        const tJson = (await tRes.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
        if (tJson.responseStatus === 200 && tJson.responseData?.translatedText) {
          const tv = tJson.responseData.translatedText.trim();
          // MyMemory thỉnh thoảng trả về chính EN nếu không dịch được — kiểm tra khác EN
          if (tv && tv.toLowerCase() !== enMeaning.toLowerCase()) viMeaning = normalizeMeaningVi(tv.slice(0, 180), key);
        }
      }
    } catch {
      // ignore translate error
    }
    if (!viMeaning) {
      jishoCache.set(key, null);
      return null;
    }
    const meaning = viMeaning;
    const level = jlptToLevel(first.jlpt ?? []);
    const isCommon = !!first.is_common;
    const out = { meaning, level, isCommon };
    jishoCache.set(key, out);
    return out;
  } catch {
    jishoCache.set(key, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtractedVocab = {
  word: string;
  reading: string;
  pos: string;
  /** alias of basic_form for compatibility */
  basic: string;
  basic_form: string;
  freq: number;
  vocabId: number | null;
  meaning: string;
  level: string | null;
  subtitleIds: number[];
  /** loại tên riêng (person/place/org/proper) — null nếu là từ vựng thường */
  isProper?: ProperNounKind | null;
};

export type VideoVocabStats = {
  totalSubtitles: number;
  distinctWords: number;
  totalTokens: number;
};

// Type for internal aggregation — uses Set for dynamic dedup (correct per project rules)
type AggregatedEntry = {
  word: string;
  reading: string;
  pos: string;
  basic: string;
  basic_form: string;
  freq: number;
  subtitleIds: Set<number>;
  firstSurface: string;
  sample: string | null;
  /** loại tên riêng — để tách nghĩa riêng, không tra từ điển */
  properKind: ProperNounKind | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAggregatedMap(
  tokenized: { subtitleId: number; tokens: KuromojiToken[] }[],
  sampleById?: Map<number, string>
): Map<string, AggregatedEntry> {
  const map = new Map<string, AggregatedEntry>();

  for (const { subtitleId, tokens } of tokenized) {
    // Gộp cụm katakana+hiragana (ジェラってる, ググる…) TRƯỚC khi lọc/dedup
    // để tra nghĩa cả cụm thay vì mảnh lẻ (ジェラ → "gelatin" sai)
    // Sau đó gộp cụm cố định danh từ + phó từ + động từ (気になる, 夢を見る…)
    const merged = mergeCollocations(mergeMixedScriptTokens(tokens));
    for (const token of merged) {
      if (isSkippableToken(token)) continue;

      const key = getDedupKey(token);
      if (!key) continue;

      const existing = map.get(key);
      if (existing) {
        existing.freq += 1;
        existing.subtitleIds.add(subtitleId);
      } else {
        const basic = (token.basic_form ?? "").trim() || key;
        map.set(key, {
          word: key,
          reading: (token.reading ?? "").trim(),
          pos: (token.pos ?? "").trim(),
          basic,
          basic_form: basic,
          freq: 1,
          subtitleIds: new Set<number>([subtitleId]),
          firstSurface: (token.surface_form ?? "").trim(),
          sample: sampleById?.get(subtitleId)?.slice(0, 120) ?? null,
          properKind: getProperNounKind(token),
        });
      }
    }
  }

  return map;
}

async function enrichWithVocabulary(
  entries: AggregatedEntry[],
  onMeanings?: ChunkProgressFn,
  /** Anime: giữ cả từ chưa rõ nghĩa (chiêu thức, tên riêng lạ…) để hiện hết */
  keepUnknown?: boolean
): Promise<ExtractedVocab[]> {
  if (entries.length === 0) return [];
  // Batch DB lookup: 1 query thay vì N
  const allWords = new Set<string>();
  for (const e of entries) {
    if (e.basic_form) allWords.add(e.basic_form);
    if (e.word) allWords.add(e.word);
    if (e.firstSurface && e.firstSurface !== e.word && e.firstSurface !== e.basic_form) allWords.add(e.firstSurface);
  }
  const vocabRows = await prisma.vocabulary.findMany({ where: { word: { in: [...allWords] } } });
  const vocabByWord = new Map<string, (typeof vocabRows)[number]>();
  for (const v of vocabRows) {
    if (!vocabByWord.has(v.word)) vocabByWord.set(v.word, v);
  }

  // Tên riêng: nghĩa cố định, KHÔNG tra Gemini/Jisho (tránh dịch sai tên người)
  const needMeanings = entries.filter((e) => {
    if (e.properKind) return false;
    const r =
      vocabByWord.get(e.basic_form) ??
      vocabByWord.get(e.word) ??
      (e.firstSurface ? vocabByWord.get(e.firstSurface) : undefined);
    return !r || PLACEHOLDER_RE.test(r.meaning);
  });
  const geminiByWord = await resolveVocabMeanings(
    needMeanings.map((e) => ({
      word: e.basic_form || e.word,
      reading: e.reading,
      pos: e.pos,
      sample: e.sample,
    })),
    onMeanings
  );

  const enriched = await Promise.all(
    entries.map(async (e) => {
      const lookupWord = e.basic_form || e.word;
      let resolved = vocabByWord.get(e.basic_form) ?? vocabByWord.get(e.word) ?? null;
      if (!resolved && e.firstSurface) resolved = vocabByWord.get(e.firstSurface) ?? null;
      const base = {
        word: e.word,
        // Reading nhất quán: katakana giữ katakana, còn lại hiragana
        reading: formatReading(e.word, e.reading),
        pos: e.pos,
        basic: e.basic,
        basic_form: e.basic_form,
        freq: e.freq,
        subtitleIds: Array.from(e.subtitleIds).sort((a, b) => a - b),
        isProper: e.properKind,
      };
      // Tên riêng: nghĩa cố định theo loại, ưu tiên DB nếu đã lưu đúng.
      // Reading: ưu tiên map tên đã biết (kuromoji đọc tên kanji bằng on'yomi nên sai,
      // VD 漏瑚→ろうこ thay vì じょうご). DB đúng (bắt đầu "Tên ") vẫn giữ.
      if (e.properKind) {
        const keepDb =
          resolved && !PLACEHOLDER_RE.test(resolved.meaning) && resolved.meaning.startsWith("Tên ");
        const knownReading = getKnownProperReading(e.word) ?? getKnownProperReading(e.basic_form);
        const knownMeaning = buildKnownProperMeaning(e.word) ?? buildKnownProperMeaning(e.basic_form);
        const fixedReading = knownReading ?? e.reading;
        if (keepDb && resolved) {
          // DB đã đúng nghĩa nhưng reading có thể vẫn sai kiểu kuromoji → vá reading đã biết
          const needReadingFix = knownReading && resolved.reading !== knownReading;
          return {
            ...base,
            reading: needReadingFix ? knownReading : base.reading,
            vocabId: resolved?.id ?? null,
            meaning: resolved.meaning,
            level: resolved.level as unknown as string,
          } satisfies ExtractedVocab;
        }
        return {
          ...base,
          reading: fixedReading,
          vocabId: resolved?.id ?? null,
          meaning: knownMeaning ?? buildProperNounMeaning(e.word, e.properKind),
          level: keepDb && resolved ? (resolved.level as unknown as string) : null,
        } satisfies ExtractedVocab;
      }
      const gemini = geminiByWord.get(lookupWord) ?? geminiByWord.get(e.word) ?? null;
      // Reading đúng nhất: tên trong map → chuẩn; tên kanji + AI có nanori → AI;
      // còn lại giữ kuromoji. (Trước đây bỏ qua gemini.reading nên 漏瑚/花御
      // không tag 固有名詞 vẫn hiện phiên âm ghép sai ろうこ/はなお.)
      const smartReading = formatReading(e.word, resolveReading({
        word: e.word,
        basic: e.basic_form,
        kuromojiReading: e.reading,
        geminiReading: gemini?.reading,
        isProper: !!e.properKind,
      }));
      // Tên trong map mà nghĩa chưa cố định (không tag proper) → gán nghĩa chuẩn luôn
      const knownMeaningFix = buildKnownProperMeaning(e.word) ?? buildKnownProperMeaning(e.basic_form);
      if (gemini) {
        return {
          ...base,
          reading: smartReading,
          vocabId: resolved?.id ?? null,
          meaning: knownMeaningFix ?? gemini.meaning,
          level: gemini.level,
        } satisfies ExtractedVocab;
      }
      // Cụm cố định (気になる…) → nghĩa từ điển có sẵn, khỏi gọi Jisho
      const collocation = lookupCollocation(lookupWord);
      if (collocation) {
        return { ...base, reading: smartReading, vocabId: resolved?.id ?? null, meaning: collocation.meaning, level: collocation.level } satisfies ExtractedVocab;
      }
      if (resolved && !PLACEHOLDER_RE.test(resolved.meaning)) {
        // DB cũ có thể lưu reading kuromoji sai (ろうこ/はなお) → vá bằng reading chuẩn
        const dbReadingOk = !getKnownProperReading(e.word) && !getKnownProperReading(e.basic_form);
        return { ...base, reading: dbReadingOk ? base.reading : smartReading, vocabId: resolved.id, meaning: knownMeaningFix ?? resolved.meaning, level: resolved.level as unknown as string } satisfies ExtractedVocab;
      }
      const jisho = await fetchJisho(lookupWord);
      if (jisho) {
        return { ...base, reading: smartReading, vocabId: resolved?.id ?? null, meaning: knownMeaningFix ?? jisho.meaning, level: jisho.level } satisfies ExtractedVocab;
      }
      if (resolved) {
        return { ...base, reading: smartReading, vocabId: resolved.id, meaning: knownMeaningFix ?? resolved.meaning, level: resolved.level as unknown as string } satisfies ExtractedVocab;
      }
      return { ...base, reading: smartReading, vocabId: null, meaning: "(chưa có trong từ điển)", level: null } satisfies ExtractedVocab;
    })
  );
  const filtered = keepUnknown
    ? enriched
    : enriched.filter((x) => x.meaning !== "(chưa có trong từ điển)" || x.vocabId !== null);
  if (filtered.length < 5 && enriched.length > 0) {
    const kanjiFallback = enriched.filter((x) => /\p{Script=Han}/u.test(x.word) && x.freq >= 2);
    const merged = new Map<string, ExtractedVocab>();
    for (const v of [...filtered, ...kanjiFallback]) merged.set(v.word, v);
    return Array.from(merged.values());
  }
  if (filtered.length === 0 && enriched.length > 0) {
    return enriched.filter((x) => /\p{Script=Han}/u.test(x.word)).slice(0, 5);
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/**
 * Extract vocab from all subtitles of a video.
 * - Loads subtitles, tokenizes each raw_text via Promise.all + cache
 * - Filters POS useful only, dedup by basic_form||surface, count freq
 * - Lookup Vocabulary for meaning/level
 * - Sort freq desc, limit 30
 */
export async function extractVocabFromVideo(videoId: number): Promise<ExtractedVocab[]> {
  "use server";
  return extractVocabCore(videoId);
}

/**
 * Core trích xuất — route SSE truyền onProgress để báo phần trăm.
 * Gọi trực tiếp từ server code nên nhận được callback (không qua client boundary).
 */
export async function extractVocabCore(videoId: number, onProgress?: StageProgressFn): Promise<ExtractedVocab[]> {
  if (typeof videoId !== "number" || !Number.isFinite(videoId) || videoId <= 0) {
    return [];
  }

  const [video, subtitles] = await Promise.all([
    prisma.video.findUnique({ where: { id: videoId }, select: { level: true, category: true } }),
    prisma.subtitle.findMany({ where: { video_id: videoId }, orderBy: { start_time_ms: "asc" }, select: { id: true, raw_text: true, translation: true } }),
  ]);

  if (subtitles.length === 0) return [];

  // Anime: trích TẤT CẢ từ (kể cả chiêu thức, tên riêng lạ, >50 từ) — không cắt top, không lọc level
  const isAnime = (video?.category as unknown as string) === "ANIME";

  // Tokenize theo batch 25 để vừa song song vừa báo tiến trình được
  const tokenized: Array<{ subtitleId: number; tokens: KuromojiToken[] }> = [];
  for (let i = 0; i < subtitles.length; i += 25) {
    const rows = await Promise.all(
      subtitles.slice(i, i + 25).map(async (sub) => {
        const text = (sub.raw_text ?? "").trim();
        if (!text) return { subtitleId: sub.id, tokens: [] as KuromojiToken[] };
        const key = cacheKey(sub.id, text);
        const cached = tokenCache.get(key);
        const tokens = cached ?? (await getCachedTokens(text));
        if (!cached) tokenCache.set(key, tokens);
        return { subtitleId: sub.id, tokens };
      })
    );
    tokenized.push(...rows);
    onProgress?.("tokenize", tokenized.length, subtitles.length);
  }

  const sampleById = new Map<number, string>(
    subtitles.map((s) => [s.id, sampleWithTranslation(s.raw_text ?? "", s.translation)])
  );
  const aggregated = toAggregatedMap(tokenized, sampleById);

  if (aggregated.size === 0) return [];

  const sortedEntries = Array.from(aggregated.values()).sort((a, b) => b.freq - a.freq);
  // Thường: top 80 theo freq (đủ cho lyrics dài 163 dòng). Anime: lấy hết, không cắt.
  const topEntries = isAnime ? sortedEntries : sortedEntries.slice(0, 80);
  let enriched = await enrichWithVocabulary(topEntries, (d, t) => onProgress?.("meanings", d, t), isAnime);
  enriched.sort((a, b) => b.freq - a.freq);

  if (isAnime) {
    // Anime: giữ hết mọi level + từ chưa rõ nghĩa, không giới hạn 60
    onProgress?.("finalize", 1, 1);
    return enriched;
  }

  const allowed = video ? getAllowedLevels(video.level as unknown as string) : null;
  if (allowed) {
    // Giữ từ có level trong window, nhưng vẫn giữ từ chưa có level (null) để không mất vocab mới
    // Sắp xếp: ưu tiên trong window lên trước
    const inWindow: typeof enriched = [];
    const noLevel: typeof enriched = [];
    const outWindow: typeof enriched = [];
    for (const v of enriched) {
      if (v.level === null) noLevel.push(v);
      else if (allowed.has(v.level)) inWindow.push(v);
      else outWindow.push(v);
    }
    // Ưu tiên: trong window (giữ hết) + null level (giữ) + ngoài window (giữ 30% để không mất hẳn)
    // Nhưng để đáp ứng yêu cầu "±1", mặc định chỉ trả inWindow + noLevel (đủ cho lyrics)
    enriched = [...inWindow, ...noLevel];
    // Nếu vẫn ít (<10) thì bổ sung thêm outWindow để không trắng
    if (enriched.length < 10 && outWindow.length > 0) {
      enriched = [...enriched, ...outWindow.slice(0, 10 - enriched.length)];
    }
  }
  // Giới hạn hiển thị 60 từ (tăng từ 30) — đủ cho lyrics dài
  if (enriched.length > 60) enriched = enriched.slice(0, 60);
  onProgress?.("finalize", 1, 1);
  return enriched;
}

/**
 * Extract vocab from arbitrary texts (no DB subtitles).
 * Used for testing / preview without videoId.
 */
export async function extractVocabFromTexts(texts: string[]): Promise<ExtractedVocab[]> {
  "use server";

  if (!Array.isArray(texts) || texts.length === 0) return [];

  const cleaned = texts
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (cleaned.length === 0) return [];

  const tokenized = await Promise.all(
    cleaned.map(async (text, idx) => {
      const tokens = await getCachedTokens(text);
      // Use idx as pseudo subtitleId for traceability; caller can map
      return { subtitleId: idx, tokens };
    })
  );

  const sampleById = new Map<number, string>(cleaned.map((t, idx) => [idx, t]));
  const aggregated = toAggregatedMap(tokenized, sampleById);

  if (aggregated.size === 0) return [];

  const sortedEntries = Array.from(aggregated.values()).sort((a, b) => b.freq - a.freq);
  const topEntries = sortedEntries.slice(0, 30);

  const enriched = await enrichWithVocabulary(topEntries);
  enriched.sort((a, b) => b.freq - a.freq);

  return enriched;
}

/**
 * Stats helper for UI — total subtitles, distinct words after filtering, total tokens
 */
export async function getVideoVocabStats(videoId: number): Promise<VideoVocabStats> {
  "use server";

  if (typeof videoId !== "number" || !Number.isFinite(videoId) || videoId <= 0) {
    return { totalSubtitles: 0, distinctWords: 0, totalTokens: 0 };
  }

  const subtitles = await prisma.subtitle.findMany({
    where: { video_id: videoId },
    select: { id: true, raw_text: true },
  });

  if (subtitles.length === 0) {
    return { totalSubtitles: 0, distinctWords: 0, totalTokens: 0 };
  }

  const tokenized = await Promise.all(
    subtitles.map(async (sub) => {
      const t = (sub.raw_text ?? "").trim();
      if (!t) return { subtitleId: sub.id, tokens: [] as KuromojiToken[] };
      const tokens = await getCachedTokens(t);
      return { subtitleId: sub.id, tokens };
    })
  );

  let totalTokens = 0;
  for (const { tokens } of tokenized) totalTokens += tokens.length;

  const aggregated = toAggregatedMap(tokenized);

  return {
    totalSubtitles: subtitles.length,
    distinctWords: aggregated.size,
    totalTokens,
  };
}

// ---------------------------------------------------------------------------
// Mở rộng thư viện từ vựng từ các dòng sub cho trước (mới thêm).
// Dùng cho flow thêm video/phụ đề: chỉ quét dòng mới, không quét lại cả video.
// ---------------------------------------------------------------------------
export async function expandVocabularyLibraryFromVideo(
  videoId: number,
  onlySubtitleIds?: number[]
): Promise<{ added: number; skipped: number; totalDistinct: number }> {
  "use server";
  if (!videoId || Number.isNaN(videoId)) return { added: 0, skipped: 0, totalDistinct: 0 };
  const subtitles = await prisma.subtitle.findMany({
    where: onlySubtitleIds && onlySubtitleIds.length > 0
      ? { video_id: videoId, id: { in: onlySubtitleIds } }
      : { video_id: videoId },
    select: { id: true, raw_text: true, translation: true },
  });
  if (subtitles.length === 0) return { added: 0, skipped: 0, totalDistinct: 0 };
  return expandVocabularyForRows(subtitles, undefined);
}

export async function expandVocabularyForRows(
  rows: Array<{ id: number; raw_text: string | null; translation?: string | null }>,
  onProgress?: StageProgressFn
): Promise<{ added: number; skipped: number; totalDistinct: number }> {
  if (rows.length === 0) return { added: 0, skipped: 0, totalDistinct: 0 };
  const subtitles = rows;
  const tokenized: Array<{ subtitleId: number; tokens: KuromojiToken[] }> = [];
  for (let i = 0; i < subtitles.length; i += 25) {
    const batch = await Promise.all(
      subtitles.slice(i, i + 25).map(async (sub) => {
        const t = (sub.raw_text ?? "").trim().replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, "");
        if (!t) return { subtitleId: sub.id, tokens: [] as KuromojiToken[] };
        const key = cacheKey(sub.id, t);
        const cached = tokenCache.get(key);
        const toks = cached ?? (await getCachedTokens(t));
        if (!cached) tokenCache.set(key, toks);
        return { subtitleId: sub.id, tokens: toks };
      })
    );
    tokenized.push(...batch);
    onProgress?.("tokenize", tokenized.length, subtitles.length);
  }
  const sampleById = new Map<number, string>(
    subtitles.map((s) => [s.id, sampleWithTranslation(s.raw_text ?? "", s.translation)])
  );
  const aggregated = toAggregatedMap(tokenized, sampleById);
  if (aggregated.size === 0) return { added: 0, skipped: 0, totalDistinct: 0 };
  const entries = Array.from(aggregated.values());
  const allWords = new Set<string>();
  for (const e of entries) {
    allWords.add(e.word);
    if (e.basic_form !== e.word) allWords.add(e.basic_form);
  }
  const existingRows = await prisma.vocabulary.findMany({ where: { word: { in: [...allWords] } }, select: { word: true } });
  const existingSet = new Set(existingRows.map((r) => r.word));
  const toAdd = entries.filter((e) => !existingSet.has(e.word) && !existingSet.has(e.basic_form));
  if (toAdd.length === 0) return { added: 0, skipped: entries.length, totalDistinct: entries.length };
  // Gemini batch: 1 call cho cả danh sách (kèm câu mẫu). Từ nào miss → Jisho fallback.
  // Tên riêng tách riêng: nghĩa cố định, không tốn call AI.
  const normalToAdd = toAdd.filter((e) => !e.properKind);
  const properToAdd = toAdd.filter((e) => e.properKind);
  const geminiByWord = await resolveVocabMeanings(
    normalToAdd.map((e) => ({
      word: e.basic_form || e.word,
      reading: e.reading,
      pos: e.pos,
      sample: e.sample,
    })),
    (d, t) => onProgress?.("meanings", d, t)
  );
  const stillNeed = normalToAdd.filter((e) => !geminiByWord.has(e.basic_form || e.word));
  const jishoByWord = new Map<string, { meaning: string; level: string | null }>();
  for (let i = 0; i < stillNeed.length; i += 5) {
    const chunkRes = await Promise.all(
      stillNeed.slice(i, i + 5).map(async (e) => {
        const j = await fetchJisho(e.basic_form || e.word);
        return { key: e.basic_form || e.word, jisho: j ? { meaning: j.meaning, level: j.level } : null };
      })
    );
    for (const { key, jisho } of chunkRes) if (jisho) jishoByWord.set(key, jisho);
  }
  let added = 0;
  const toCreate: Array<{ word: string; reading: string; meaning: string; level: Level }> = [];
  // Tên riêng trước: nghĩa cố định theo loại (không gọi AI/Jisho)
  for (const entry of properToAdd) {
    const word = entry.basic_form !== "*" && entry.basic_form ? entry.basic_form : entry.word;
    if (existingSet.has(word)) continue;
    // Reading chuẩn từ map tên đã biết (kuromoji on'yomi sai với tên kanji)
    const reading = formatReading(word, getKnownProperReading(word) ?? getKnownProperReading(entry.word) ?? entry.reading ?? word);
    const meaning = buildKnownProperMeaning(word) ?? buildKnownProperMeaning(entry.word) ?? buildProperNounMeaning(word, entry.properKind);
    const rawLevel = /\p{Script=Han}/u.test(word) ? "N3" : "N4";
    existingSet.add(word);
    toCreate.push({ word, reading, meaning: meaning.slice(0, 500), level: rawLevel as Level });
  }
  for (const entry of normalToAdd) {
    const g = geminiByWord.get(entry.basic_form || entry.word);
    const jisho = g ? { meaning: g.meaning, level: g.level } : jishoByWord.get(entry.basic_form || entry.word);
    // Cụm cố định (気になる…) → nghĩa từ điển, ưu tiên trước cả Gemini
    const collo = !g ? lookupCollocation(entry.basic_form || entry.word) : null;
    const found = jisho ?? (collo ? { meaning: collo.meaning, level: collo.level } : null);
    // Ưu tiên basic_form do Gemini chuẩn hóa (đúng thể nguyên mẫu hơn kuromoji)
    const word = (g?.basic_form && g.basic_form !== "*" ? g.basic_form : null)
      ?? (entry.basic_form !== "*" && entry.basic_form ? entry.basic_form : entry.word);
    if (existingSet.has(word)) continue;
    if (!found?.meaning) {
      // Cả Gemini lẫn Jisho đều không biết → BỎ QUA để lần sau thử lại, KHÔNG ghi placeholder.
      // Chỉ giữ tên riêng katakana dài (VTuber, nhân vật).
      const isName = /^[ァ-ンー]{3,}$/u.test(word) && entry.pos.startsWith("名詞");
      if (!isName) continue;
    }
    const reading = collo ? formatReading(word, collo.reading) : formatReading(word, resolveReading({
      word,
      basic: entry.basic_form,
      kuromojiReading: entry.reading || word,
      geminiReading: g?.reading,
      isProper: !!entry.properKind,
    }));
    const meaning = found?.meaning ?? `Tên riêng/ katakana: ${word} (${reading})`;
    const rawLevel = found?.level ?? (/\p{Script=Han}/u.test(word) ? "N3" : "N4");
    const lvl = (["N5", "N4", "N3", "N2", "N1"].includes(rawLevel) ? rawLevel : "N3") as Level;
    existingSet.add(word);
    toCreate.push({ word, reading, meaning: meaning.slice(0, 500), level: lvl });
  }
  if (toCreate.length > 0) {
    // Recheck theo word suy ra cuối cùng (Gemini có thể chuẩn hóa khác key ban đầu) — chống dupe
    const recheck = await prisma.vocabulary.findMany({ where: { word: { in: toCreate.map((c) => c.word) } }, select: { word: true } });
    const dupes = new Set(recheck.map((r) => r.word));
    const final = toCreate.filter((c) => !dupes.has(c.word));
    if (final.length > 0) {
      // createMany với skipDuplicates để tránh race
      const res = await prisma.vocabulary.createMany({ data: final, skipDuplicates: true });
      added = res.count;
    }
  }
  return { added, skipped: entries.length - added, totalDistinct: entries.length };
}

export async function expandVocabularyFromTexts(texts: string[]): Promise<{ added: number; skipped: number }> {
  "use server";
  if (!texts || texts.length === 0) return { added: 0, skipped: 0 };
  const cleaned = texts.map((t) => t.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").trim()).filter(Boolean);
  if (cleaned.length === 0) return { added: 0, skipped: 0 };
  const tokenized = await Promise.all(cleaned.map(async (t, i) => ({ subtitleId: i, tokens: await getCachedTokens(t) })));
  const sampleById = new Map<number, string>(cleaned.map((t, idx) => [idx, t]));
  const aggregated = toAggregatedMap(tokenized, sampleById);
  const entries = Array.from(aggregated.values());
  const allWords = new Set(entries.map((e) => e.word));
  const existing = await prisma.vocabulary.findMany({ where: { word: { in: [...allWords] } }, select: { word: true } });
  const set = new Set(existing.map((r) => r.word));
  const toAdd = entries.filter((e) => !set.has(e.word));
  let added = 0;
  const geminiByWord = await resolveVocabMeanings(
    toAdd.map((e) => ({
      word: e.basic_form || e.word,
      reading: e.reading,
      pos: e.pos,
      sample: e.sample,
    }))
  );
  for (const e of toAdd) {
    const lookup = e.basic_form || e.word;
    const g = geminiByWord.get(lookup);
    const j = g ? { meaning: g.meaning, level: g.level } : await fetchJisho(lookup);
    const w = (g?.basic_form && g.basic_form !== "*" ? g.basic_form : null)
      ?? (e.basic_form && e.basic_form !== "*" ? e.basic_form : e.word);
    // Tên riêng: nghĩa cố định, không tra AI/Jisho
    if (e.properKind) {
      if (set.has(w)) continue;
      try {
        await prisma.vocabulary.create({
          data: {
            word: w,
            reading: formatReading(w, getKnownProperReading(w) ?? e.reading ?? w),
            meaning: buildKnownProperMeaning(w) ?? buildProperNounMeaning(w, e.properKind),
            level: (/\p{Script=Han}/u.test(w) ? "N3" : "N4") as Level,
          },
        });
        set.add(w);
        added++;
      } catch {}
      continue;
    }
    if (!j?.meaning) {
      // Không ghi placeholder "(từ mới…)" — để lần sau thử lại; chỉ giữ tên riêng katakana
      if (!(/^[ァ-ンー]{3,}$/u.test(w) && e.pos.startsWith("名詞"))) continue;
      try {
        await prisma.vocabulary.create({ data: { word: w, reading: e.reading || w, meaning: `Tên riêng/ katakana: ${w} (${e.reading || w})`, level: "N4" } });
        added++;
      } catch {}
      continue;
    }
    const lvl = ((j.level && ["N5", "N4", "N3", "N2", "N1"].includes(j.level) ? j.level : "N3")) as Level;
    try {
      await prisma.vocabulary.create({ data: { word: w, reading: formatReading(w, e.reading || w), meaning: j.meaning, level: lvl } });
      added++;
    } catch {}
  }
  return { added, skipped: entries.length - added };
}
