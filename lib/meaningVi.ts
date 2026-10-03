/**
 * Chuẩn hóa nghĩa từ vựng: CHỈ tiếng Việt.
 * - Cắt đuôi tiếng Anh kiểu "em bé (baby, infant)" → "em bé".
 * - Giữ ngoặc tiếng Việt ("Pekora (tên VTuber)") — chỉ cắt khi trong ngoặc là tiếng Anh.
 * - Từ là danh từ tiếng Anh (Latin) → giữ từ + giải thích Việt đằng sau: "YouTube — trang chia sẻ video".
 */

const VI_DIACRITICS_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const TRAILING_PAREN_RE = /\s*\(([^()]*)\)\s*$/;
const ENGLISH_WORD_RE = /^[A-Za-z][A-Za-z0-9 .,'’\-!?]*$/;

/** Nội dung trong ngoặc có phải tiếng Anh không (có chữ Latin, không dấu Việt). */
export function isEnglishParenContent(s: string): boolean {
  const t = (s ?? "").trim();
  if (!t) return false;
  return /[A-Za-z]/.test(t) && !VI_DIACRITICS_RE.test(t);
}

/** Từ có phải danh từ tiếng Anh (chữ Latin) không. */
export function isEnglishWord(word: string): boolean {
  return ENGLISH_WORD_RE.test((word ?? "").trim());
}

/**
 * Katakana → hiragana (kuromoji trả reading katakana: スゴシ, ハマゴウ…).
 * App chuẩn hiển thị hiragana — mọi reading đi qua đây trước khi lưu/hiện.
 */
export function kataToHira(s: string): string {
  return (s ?? "").replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/** Chuẩn hóa reading về hiragana gọn (cắt khoảng trắng, rớt về fallback nếu rỗng). */
export function normalizeReading(reading: string, fallback = ""): string {
  const h = kataToHira((reading ?? "").trim());
  return h || (fallback ?? "").trim();
}

const KATAKANA_WORD_RE = /^[ァ-ンー]+$/;

/**
 * Reading chuẩn để LƯU và HIỆN: từ katakana (テレビ, ジョウゴ) giữ nguyên
 * katakana; còn lại ép về hiragana (kuromoji/DB cũ hay lẫn katakana).
 * Dùng ở mọi nơi thay vì gọi kataToHira trực tiếp.
 */
export function formatReading(word: string, reading: string): string {
  const w = (word ?? "").trim();
  const r = (reading ?? "").trim() || w;
  if (KATAKANA_WORD_RE.test(w)) return r;
  return kataToHira(r) || w;
}

/** Nghĩa có phải toàn tiếng Anh (cần dịch lại) — có chữ Latin, không dấu Việt, không chữ Nhật. */
export function isEnglishOnlyMeaning(m: string): boolean {
  const t = (m ?? "").trim();
  if (!t) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (VI_DIACRITICS_RE.test(t)) return false;
  // Còn chữ Nhật (kana/kanji) → không coi là EN thuần (VD giải thích giữ từ gốc)
  if (/[぀-ヿ一-鿿々〆]/.test(t)) return false;
  // Có dấu hiệu Việt không dấu nhưng vẫn là Việt? Nếu có từ Việt phổ biến thì không phải EN.
  // Heuristic ngược: nếu toàn bộ là Latin + số + punctuation và chứa động từ EN điển hình
  // ("to ...", " / ", "sb/sth") → chắc chắn EN. Còn lại: nếu không có dấu Việt thì coi là EN cần dịch.
  return true;
}

/**
 * Nghĩa tên riêng do AI đoán mò trước đây (VD "Yukkotsu, nhân vật trong truyện"):
 * romaji sai + chú thích chung chung "trong truyện" — cần tra lại.
 * Nghĩa cố định đúng ("Tên người: 乙骨") và nghĩa thường ("nhân vật chính") KHÔNG khớp.
 */
const STALE_NAME_GUESS_RE = /[A-Za-z].*(nhân vật trong truyện|nhan vat trong truyen)/i;

export function isStaleGuessedNameMeaning(m: string): boolean {
  const t = (m ?? "").trim();
  if (!t) return false;
  if (t.startsWith("Tên ")) return false;
  return STALE_NAME_GUESS_RE.test(t);
}

/**
 * Chuẩn hóa nghĩa về tiếng Việt thuần.
 * @param meaning nghĩa gốc (có thể lẫn đuôi EN)
 * @param word từ gốc — để nhận diện danh từ tiếng Anh cần giữ lại + giải thích Việt sau
 */
export function normalizeMeaningVi(meaning: string, word?: string): string {
  let m = (meaning ?? "").trim().replace(/\s+/g, " ");
  if (!m) return m;

  // Cắt lặp đuôi EN: "a (b) (c)" → cắt đến khi hết
  for (let i = 0; i < 3; i++) {
    const mt = m.match(TRAILING_PAREN_RE);
    if (!mt) break;
    if (!isEnglishParenContent(mt[1])) break;
    m = m.slice(0, mt.index).trim();
    if (!m) break;
  }
  if (!m) return "";

  // Danh từ tiếng Anh: giữ từ + giải thích Việt đằng sau
  const w = (word ?? "").trim();
  if (w && isEnglishWord(w) && !m.toLowerCase().startsWith(w.toLowerCase())) {
    return `${w} — ${m}`;
  }
  return m;
}
