import "server-only";

import { prisma } from "./prisma";
import { getCachedVocab } from "./cache";
import { resolveVocabMeanings } from "./gemini";
import { lookupCollocation } from "./collocations";
import { isEnglishOnlyMeaning, isStaleGuessedNameMeaning, normalizeMeaningVi, formatReading } from "./meaningVi";
import { getKnownProperReading, resolveReading } from "./properNames";
import { isCommonKanaWord } from "./vocabFilter";
import type { Level } from "@prisma/client";

/**
 * Lookup từ vựng thông minh cho tooltip tra từ:
 * 1. DB exact (word + reading) → contains → trả ngay.
 * 2. DB miss → Gemini theo ngữ cảnh câu mẫu (sample) → upsert DB để lần sau trúng ngay.
 * 3. Thất bại hết → null (UI hiện "chưa có nghĩa").
 */

export type VocabRow = {
  id: number;
  word: string;
  reading: string;
  meaning: string;
  level: string | null;
};

/** Epoch để bust toàn bộ cache khi ADMIN sửa từ (updateVocab/createVocab gọi bustVocabCache). */
let vocabCacheEpoch = 0;

/** Tăng epoch → mọi lookup sau bỏ qua cache cũ (gọi sau khi ADMIN sửa/tạo/xóa từ). */
export function bustVocabCache(): void {
  vocabCacheEpoch++;
}

export function buildVocabCacheKey(word: string, reading?: string, sample?: string): string {
  const base = reading ? `vocab:wr:${word}:${reading}` : `vocab:word:${word}`;
  const keyed = `v${vocabCacheEpoch}:${base}`;
  if (!sample) return keyed;
  let h = 0;
  for (let i = 0; i < sample.length; i++) h = (Math.imul(h, 31) + sample.charCodeAt(i)) | 0;
  return `${keyed}:s${(h >>> 0).toString(36)}`;
}

const VALID_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1"]);

export async function lookupVocabSmart(
  word: string,
  opts?: { reading?: string; sample?: string | null; properHint?: boolean }
): Promise<VocabRow | null> {
  const w = (word ?? "").trim();
  if (!w) return null;
  const reading = (opts?.reading ?? "").trim() || undefined;
  const sample = (opts?.sample ?? "").trim() || undefined;
  const properHint = opts?.properHint === true;

  return getCachedVocab(buildVocabCacheKey(w, reading, sample), async () => {
    // 0. Cụm cố định (気になる…) → nghĩa từ điển, khỏi gọi AI
    const collo = lookupCollocation(w);
    if (collo) {
      const existing = await prisma.vocabulary.findFirst({ where: { word: w } });
      if (existing) return existing as VocabRow;
      return { id: 0, word: w, reading: collo.reading, meaning: collo.meaning, level: collo.level } as VocabRow;
    }
    // 1. DB trước (tên đoán mò cũ / nghĩa EN → tra lại Gemini, sửa DB)
    // DB cũ có thể lưu reading kuromoji ghép sai (漏瑚→ろうこ, 花御→はなお) → vá ngay
    if (reading) {
      const exact = await prisma.vocabulary.findFirst({ where: { word: w, reading } });
      if (exact) {
        const fixed = await repairMeaningIfNeeded(exact as VocabRow, sample, properHint);
        if (fixed) return fixed;
        const readingFixed = await repairReadingIfNeeded(exact as VocabRow);
        if (readingFixed) return readingFixed;
        const aiReading = await verifyLongKanjiReading(exact as VocabRow, sample);
        if (aiReading) return aiReading;
        return exact as VocabRow;
      }
    }
    let vocab = await prisma.vocabulary.findFirst({ where: { word: w } });
    if (vocab) {
      const fixed = await repairMeaningIfNeeded(vocab as VocabRow, sample, properHint);
      if (fixed) return fixed;
      const readingFixed = await repairReadingIfNeeded(vocab as VocabRow);
      if (readingFixed) return readingFixed;
      const aiReading = await verifyLongKanjiReading(vocab as VocabRow, sample);
      if (aiReading) return aiReading;
      return vocab as VocabRow;
    }
    vocab = await prisma.vocabulary.findFirst({ where: { word: { contains: w } } });
    if (vocab) {
      // contains có thể trúng từ khác — chỉ tự sửa khi đúng từ hoặc nghĩa EN cần dịch
      if ((vocab as VocabRow).word === w) {
        const fixed = await repairMeaningIfNeeded(vocab as VocabRow, sample, properHint);
        if (fixed) return fixed;
        const readingFixed = await repairReadingIfNeeded(vocab as VocabRow);
        if (readingFixed) return readingFixed;
        const aiReading = await verifyLongKanjiReading(vocab as VocabRow, sample);
        if (aiReading) return aiReading;
      }
      return vocab as VocabRow;
    }

    // 2. Gemini theo ngữ cảnh (slang gộp như ジェラってる chỉ đúng khi có câu mẫu)
    try {
      const resolved = await resolveVocabMeanings([
        { word: w, reading, sample: sample ?? null },
      ]);
      const hit = resolved.get(w);
      if (hit?.meaning) {
        // Ưu tiên: tên đã biết trong map → reading chuẩn (VD 漏瑚→じょうご);
        // tên riêng/trông như tên kanji + AI có nanori → reading_kana AI;
        // còn lại → reading truyền vào → basic_form từ điển → mặt chữ
        // (KHÔNG lấy phiên âm katakana làm reading)
        const rd = formatReading(w, resolveReading({
          word: w,
          kuromojiReading: reading || (hit.basic_form && hit.basic_form !== "*" ? hit.basic_form : w),
          geminiReading: hit.reading,
          isProper: properHint,
        })).slice(0, 255) || w;
        const level = hit.level && VALID_LEVELS.has(hit.level) ? hit.level : "N5";
        try {
          const existing = await prisma.vocabulary.findFirst({ where: { word: w, reading: rd } });
          if (existing) return existing as VocabRow;
          const created = await prisma.vocabulary.create({
            data: { word: w, reading: rd, meaning: hit.meaning.slice(0, 500), level: level as Level },
          });
          return created as VocabRow;
        } catch {
          // DB ghi lỗi (chưa migrate/mất kết nối) → trả synthetic, tooltip vẫn hiện nghĩa
          return { id: 0, word: w, reading: rd, meaning: hit.meaning, level } as VocabRow;
        }
      }
    } catch {
      // ignore → null bên dưới
    }
    return null;
  });
}

/**
 * DB cũ có thể lưu nghĩa EN thuần (Jisho chưa dịch, VD "to long (for)...")
 * hoặc tên riêng do AI đoán mò ("Yukkotsu, nhân vật trong truyện").
 * Gặp 2 dạng này → tra lại bằng Gemini theo ngữ cảnh sample (ưu tiên),
 * fallback MyMemory EN→VI, rồi UPDATE DB để lần sau trúng ngay.
 * Trả row mới nếu sửa được, ngược lại null (caller dùng row cũ).
 */
async function repairMeaningIfNeeded(row: VocabRow, sample?: string, properHint?: boolean): Promise<VocabRow | null> {
  if (!row?.meaning) return null;
  const needsRepair = isEnglishOnlyMeaning(row.meaning) || isStaleGuessedNameMeaning(row.meaning);
  // Từ kana phổ thông bị lưu nhầm thành tên riêng (VD "Tên địa danh: 成程")
  // → tra lại nghĩa thường (なるほど = "ra là thế")
  const w = (row.word ?? "").trim();
  const isFalseProper = w && row.meaning.startsWith("Tên ") && isCommonKanaWord(w);
  if (!needsRepair && !isFalseProper) return null;
  if (!w) return null;
  // 1. Gemini theo ngữ cảnh
  try {
    const resolved = await resolveVocabMeanings([{ word: w, reading: row.reading, sample: sample ?? null }]);
    const hit = resolved.get(w);
    if (hit?.meaning && !isEnglishOnlyMeaning(hit.meaning) && !isStaleGuessedNameMeaning(hit.meaning)) {
      const meaning = normalizeMeaningVi(hit.meaning, w).slice(0, 500) || hit.meaning.slice(0, 500);
      const level = hit.level && VALID_LEVELS.has(hit.level) ? hit.level : row.level ?? "N5";
      // Tên riêng: dùng reading_kana AI trả về (nanori, VD おっこつ) thay reading ghép on'yomi cũ.
      // Từ当て字 tra lại (成程→なるほど) cũng lấy reading AI.
      const useAiReading = (properHint || isCommonKanaWord(w)) && hit.reading;
      const reading = useAiReading ? hit.reading!.slice(0, 255) : row.reading;
      try {
        const updated = await prisma.vocabulary.update({ where: { id: row.id }, data: { meaning, level: level as Level, reading } });
        return updated as VocabRow;
      } catch {
        return { ...row, meaning, level, reading } as VocabRow;
      }
    }
  } catch {
    // ignore → fallback MyMemory
  }
  // 2. Fallback MyMemory (offline-friendly, không cần key)
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(row.meaning.slice(0, 400))}&langpair=en|vi`;
    const res = await fetch(url);
    if (res.ok) {
      const j = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
      const tv = (j.responseData?.translatedText ?? "").trim();
      if (j.responseStatus === 200 && tv && tv.toLowerCase() !== row.meaning.toLowerCase() && !isEnglishOnlyMeaning(tv)) {
        const meaning = normalizeMeaningVi(tv.slice(0, 500), w);
        if (meaning) {
          try {
            const updated = await prisma.vocabulary.update({ where: { id: row.id }, data: { meaning } });
            return updated as VocabRow;
          } catch {
            return { ...row, meaning } as VocabRow;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Cụm kanji DÀI (5+ chữ, VD chiêu thức 嵌合暗翳庭) chưa có trong map:
 * kuromoji chỉ ghép on'yomi từng chữ (ハマゴウアンエイニワ — sai).
 * Hỏi Gemini 1 lần lấy reading đúng (かんごうあんえいてい), UPDATE DB
 * để lần sau trúng ngay — DB đóng vai trò map học dần.
 * Chỉ chạy cho cụm dài (từ thường ngắn kuromoji đã đúng, khỏi tốn call).
 */
const LONG_KANJI_RE = /^[々〇〻一-鿿]{5,}$/;

async function verifyLongKanjiReading(row: VocabRow, sample?: string): Promise<VocabRow | null> {
  const w = (row.word ?? "").trim();
  if (!w || !LONG_KANJI_RE.test(w)) return null;
  if (getKnownProperReading(w)) return null; // map đã lo (repairReadingIfNeeded)
  let g = "";
  try {
    const resolved = await resolveVocabMeanings([{ word: w, reading: row.reading, sample: sample ?? null }]);
    g = (resolved.get(w)?.reading ?? "").trim();
  } catch {
    return null;
  }
  if (!g || g === row.reading) return null;
  try {
    const updated = await prisma.vocabulary.update({ where: { id: row.id }, data: { reading: g } });
    return updated as VocabRow;
  } catch {
    return { ...row, reading: g } as VocabRow;
  }
}

/**
 * DB cũ có thể lưu reading kuromoji ghép sai cho tên kanji
 * (漏瑚→ろうこ, 花御→はなお — đúng là じょうご/はなみ).
 * Nghĩa đã đúng nhưng reading sai → UPDATE mỗi reading, lần sau hiện đúng.
 * Chỉ vá khi từ nằm trong map tên đã biết (an toàn tuyệt đối, không đoán).
 */
async function repairReadingIfNeeded(row: VocabRow): Promise<VocabRow | null> {
  const w = (row.word ?? "").trim();
  if (!w) return null;
  const known = getKnownProperReading(w);
  if (!known || row.reading === known) return null;
  try {
    const updated = await prisma.vocabulary.update({ where: { id: row.id }, data: { reading: known } });
    return updated as VocabRow;
  } catch {
    return { ...row, reading: known } as VocabRow;
  }
}
