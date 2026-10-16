import type { ProperNounKind } from "./vocabFilter";

/**
 * Reading chuẩn cho tên riêng — kuromoji đọc tên kanji bằng on'yomi ghép lại
 * nên SAI với tên người (nanori/kun đặc biệt).
 * VD: 漏瑚 kuromoji → ろうこ (sai), đúng là じょうご (Jogo).
 *     花御 kuromoji → はな お/ご (sai), đúng là はなみ (Hanami).
 *
 * Ưu tiên tra map này TRƯỚC khi tin reading kuromoji.
 */

export type KnownProper = {
  reading: string;
  romaji: string;
  kind: ProperNounKind;
  work?: string;
};

const KNOWN: Record<string, KnownProper> = {
  // --- Jujutsu Kaisen: 2 tên user báo lỗi ---
  "漏瑚": { reading: "じょうご", romaji: "Jogo", kind: "person", work: "Jujutsu Kaisen" },
  "花御": { reading: "はなみ", romaji: "Hanami", kind: "person", work: "Jujutsu Kaisen" },
  // Dạng katakana của 2 tên trên (sub hay viết)
  "ジョウゴ": { reading: "じょうご", romaji: "Jogo", kind: "person", work: "Jujutsu Kaisen" },
  "ハナミ": { reading: "はなみ", romaji: "Hanami", kind: "person", work: "Jujutsu Kaisen" },
  // --- JJK mở rộng (tránh lặp lại lỗi) ---
  "虎杖悠仁": { reading: "いたどりゆうじ", romaji: "Itadori Yuji", kind: "person", work: "Jujutsu Kaisen" },
  "虎杖": { reading: "いたどり", romaji: "Itadori", kind: "person", work: "Jujutsu Kaisen" },
  "悠仁": { reading: "ゆうじ", romaji: "Yuji", kind: "person", work: "Jujutsu Kaisen" },
  "伏黒恵": { reading: "ふしぐろめぐみ", romaji: "Fushiguro Megumi", kind: "person", work: "Jujutsu Kaisen" },
  "伏黒": { reading: "ふしぐろ", romaji: "Fushiguro", kind: "person", work: "Jujutsu Kaisen" },
  "釘崎野薔薇": { reading: "くぎさきのばら", romaji: "Kugisaki Nobara", kind: "person", work: "Jujutsu Kaisen" },
  "釘崎": { reading: "くぎさき", romaji: "Kugisaki", kind: "person", work: "Jujutsu Kaisen" },
  "五条悟": { reading: "ごじょうさとる", romaji: "Gojo Satoru", kind: "person", work: "Jujutsu Kaisen" },
  "五条": { reading: "ごじょう", romaji: "Gojo", kind: "person", work: "Jujutsu Kaisen" },
  "夏油傑": { reading: "げとうすぐる", romaji: "Geto Suguru", kind: "person", work: "Jujutsu Kaisen" },
  "両面宿儺": { reading: "りょうめんすくな", romaji: "Ryomen Sukuna", kind: "person", work: "Jujutsu Kaisen" },
  "宿儺": { reading: "すくな", romaji: "Sukuna", kind: "person", work: "Jujutsu Kaisen" },
  "乙骨憂太": { reading: "おっこつゆうた", romaji: "Okkotsu Yuta", kind: "person", work: "Jujutsu Kaisen" },
  "乙骨": { reading: "おっこつ", romaji: "Okkotsu", kind: "person", work: "Jujutsu Kaisen" },
  "真人": { reading: "まひと", romaji: "Mahito", kind: "person", work: "Jujutsu Kaisen" },
  "陀艮": { reading: "だごん", romaji: "Dagon", kind: "person", work: "Jujutsu Kaisen" },
  "脹相": { reading: "ちょうそう", romaji: "Choso", kind: "person", work: "Jujutsu Kaisen" },
  // --- Chiêu thức / thuật thức (kuromoji ghép on'yomi sai với cách đọc đặc biệt) ---
  "無量空処": { reading: "むりょうくうしょ", romaji: "Muryokusho", kind: "proper", work: "Jujutsu Kaisen" },
  "伏魔御厨子": { reading: "ふくまみづし", romaji: "Fukuma Mizushi", kind: "proper", work: "Jujutsu Kaisen" },
  "領域展開": { reading: "りょういきてんかい", romaji: "Ryoiki Tenkai", kind: "proper", work: "Jujutsu Kaisen" },
  "十種影法術": { reading: "とくさのかげぼうじゅつ", romaji: "Tokusa no Kagebojustu", kind: "proper", work: "Jujutsu Kaisen" },
  "反転術式": { reading: "はんてんじゅつしき", romaji: "Hanten Jutsushiki", kind: "proper", work: "Jujutsu Kaisen" },
  "無為転変": { reading: "むいてんぺん", romaji: "Muitenpen", kind: "proper", work: "Jujutsu Kaisen" },
  "茈": { reading: "むらさき", romaji: "Murasaki", kind: "proper", work: "Jujutsu Kaisen" },
  "嵌合暗翳庭": { reading: "かんごうあんえいてい", romaji: "Kango An'eitei", kind: "proper", work: "Jujutsu Kaisen" },
};

/** Reading hiragana chuẩn của tên riêng, null nếu chưa có trong map. */
export function getKnownProperReading(word: string): string | null {
  const w = (word ?? "").trim();
  if (!w) return null;
  return KNOWN[w]?.reading ?? null;
}

/** Thông tin đầy đủ của tên riêng đã biết, null nếu chưa có. */
export function getKnownProper(word: string): KnownProper | null {
  const w = (word ?? "").trim();
  if (!w) return null;
  return KNOWN[w] ?? null;
}

/** Token trông như tên kanji gộp (乙骨, 漏瑚: 2-4 kanji, không kana). */
export function isKanjiNameLike(surface: string): boolean {
  const s = (surface ?? "").trim();
  if (s.length < 2 || s.length > 4) return false;
  return /^[々〇〻一-鿿]+$/.test(s);
}

/** Cụm toàn kanji từ 2 chữ trở lên (kể cả chiêu thức dài như 嵌合暗翳庭 5 chữ). */
export function isAllKanji(word: string): boolean {
  const s = (word ?? "").trim();
  return s.length >= 2 && /^[々〇〻一-鿿]+$/.test(s);
}

/**
 * Chọn reading đúng nhất cho một từ.
 * - Tên đã biết trong map → reading chuẩn (kuromoji/Gemini đều có thể sai).
 * - Cụm toàn kanji + có reading_kana AI → dùng AI (tên riêng nanori,
 *   chiêu thức đọc đặc biệt — kuromoji chỉ ghép on'yomi từng chữ nên sai).
 * - Còn lại → giữ reading kuromoji (đúng với từ thường có kana).
 */
export function resolveReading(opts: {
  word: string;
  basic?: string;
  kuromojiReading: string;
  geminiReading?: string | null;
  isProper?: boolean;
}): string {
  const w = (opts.word ?? "").trim();
  const b = (opts.basic ?? "").trim();
  const known = (w && getKnownProperReading(w)) ?? (b && getKnownProperReading(b));
  if (known) return known;
  const g = (opts.geminiReading ?? "").trim();
  if (g && /^[぀-ゖー]+$/.test(g) && (opts.isProper || isAllKanji(w) || (b && isAllKanji(b)))) {
    // Chặn reading AI vô lý (dài bất thường so với số chữ Hán) → rớt về kuromoji
    const kCount = (w.match(/[々〇〻一-鿿]/g) ?? []).length || (b.match(/[々〇〻一-鿿]/g) ?? []).length;
    if (g.length <= Math.max(1, kCount) * 4) return g;
  }
  return (opts.kuromojiReading ?? "").trim() || w;
}

/**
 * Nghĩa cố định cho tên riêng đã biết: "Tên người: 漏瑚 (じょうご — Jogo, Jujutsu Kaisen)".
 * Chưa biết → null để caller dùng buildProperNounMeaning + reading kuromoji/Gemini.
 */
export function buildKnownProperMeaning(word: string): string | null {
  const info = getKnownProper(word);
  if (!info) return null;
  const kindLabel = info.kind === "person" ? "người" : info.kind === "place" ? "địa danh" : info.kind === "org" ? "tổ chức" : "riêng";
  const work = info.work ? `, ${info.work}` : "";
  return `Tên ${kindLabel}: ${word} (${info.reading} — ${info.romaji}${work})`;
}

/** Tất cả tên người đã biết — dùng để loại câu hỏi tên người khỏi đề thi. */
export function getKnownPersonNames(): string[] {
  return Object.entries(KNOWN)
    .filter(([, v]) => v.kind === "person")
    .map(([k]) => k);
}

const HONORIFICS_RE = /(さん|くん|ちゃん|様|氏|先生|先輩|殿)$/;

/**
 * Dòng phụ đề có phải CHỈ là tên người (VD "五条", "「乙骨くん」")?
 * Câu như vậy không có giá trị làm đề (nghe/vocab) → caller bỏ qua.
 * - extraNames: tên người học được từ DB (nghĩa "Tên người: ...").
 * - Cố ý KHÔNG đoán bằng isKanjiNameLike để khỏi gắn nhãn nhầm từ thường (術式...).
 */
export function isNameOnlyLine(text: string, extraNames?: Set<string>): boolean {
  let t = (text ?? "").trim();
  if (!t) return false;
  t = t.replace(/^[「『"“'({\[]+/, "").replace(/[」』"”')}\].,!?！？。、…〜～・\s]+$/, "").trim();
  t = t.replace(HONORIFICS_RE, "").trim();
  if (!t || t.length > 12) return false;
  const known = getKnownProper(t);
  if (known && known.kind === "person") return true;
  if (extraNames?.has(t)) return true;
  return false;
}
