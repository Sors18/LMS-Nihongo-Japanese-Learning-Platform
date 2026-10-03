import type { KuromojiToken } from "./kuromoji";

// POS hữu ích — chỉ giữ danh/động/tính từ (từ vựng flashcard).
// Phó từ (副詞), cảm thán (感動詞), trợ từ/trợ động từ/ký hiệu → thành phần câu, không quét.
const ALLOWED_POS_MAP: Record<string, true> = {
  名詞: true,
  動詞: true,
  形容詞: true,
};

const BLOCKED_POS_MAP: Record<string, true> = {
  助詞: true,
  助動詞: true,
  記号: true,
  空白: true,
  感動詞: true, // loại aaa/ooo/おお/ああ/うわ
  副詞: true, // phó từ (すごく, もっと, ゆっくり...) — không quét
  unknown: true,
};

const PUNCT_REGEX = /^[\p{P}\p{S}\s]+$/u;

// Các từ cảm thán/noise hay gặp — lọc cứng (kể cả khi POS bị tag sai)
const NOISE_WORDS = new Set([
  "おお", "ああ", "うわ", "ええ", "あぁ", "おぉ", "うわあ", "あー", "おー",
  "おおお", "あああ", "えー", "うーん", "ん", "っ", "ー",
  "ぁ", "ぉ", "ぅ", "え", "お", "あ",
]);
// Regex lặp ký tự: "おおお", "ああ", "www", "aaa"
const REPEATED_CHAR_REGEX = /^([ぁ-んァ-ンa-zA-Z])\1{1,}$/u;
const HIRAGANA_ONLY_REGEX = /^[ぁ-んー]+$/u;
// Romaji/chữ Latin (konnichiwa, YouTube, OK, arigatou) — không phải từ vựng, không quét
const ROMAJI_REGEX = /^[\p{Script=Latin}'’\- ]+$/u;

export function isUsefulPos(pos: string): boolean {
  if (!pos) return false;
  const base = pos.split("-")[0]?.trim() ?? pos;
  if (BLOCKED_POS_MAP[base]) return false;
  return !!ALLOWED_POS_MAP[base];
}

export function isNumericSurface(surface: string): boolean {
  const t = surface.trim();
  if (!t) return false;
  return /^[0-9０-９.,，．]+$/.test(t);
}

export function isSkippableToken(token: KuromojiToken): boolean {
  let surface = (token.surface_form ?? "").trim();
  // Làm sạch zero-width / ký tự vô hình thường có trong subtitle copy-paste
  surface = surface.replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2060\u180E]/g, "").trim();
  const reading = (token.reading ?? "").trim();
  const pos = (token.pos ?? "").trim();
  let basic = (token.basic_form ?? "").trim();
  basic = basic.replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, "").trim();

  if (!surface) return true;
  // Từ kana phổ thông (なるほど/なぜ/どこ, kể cả dạng kanji 成程/何故/何処):
  // luôn tra được, kể cả khi kuromoji tag 固有名詞/副詞/代名詞
  if (isCommonKanaWord(surface, basic)) return false;
  // Romaji/chữ Latin trong phụ đề (konnichiwa, OK, YouTube) — không quét
  if (ROMAJI_REGEX.test(surface)) return true;
  if (surface.length === 1 && /^[\p{P}\p{S}\s]$/u.test(surface)) return true;
  if (NOISE_WORDS.has(surface) || NOISE_WORDS.has(basic)) return true;

  // Từ kéo dài kiểu hát/anime: ぺぺぺぺぺぺえ, キシャアアアア, ピエエエエ, ーーーー → nhiễu, bỏ
  if (surface.length >= 4) {
    // 70% ký tự giống nhau hoặc chứa 3 ký tự liên tiếp giống nhau
    if (/(.)\1{2,}/u.test(surface)) {
      // Nếu toàn katakana/hiragana kéo dài hoặc chứa ー dài
      if (/^[ぁ-んァ-ンー]+$/u.test(surface) || surface.includes("～") || surface.includes("ー")) {
        // Kiểm tra tỉ lệ lặp: nếu ký tự đầu lặp >50%
        const first = surface[0];
        const sameCount = [...surface].filter((c) => c === first || c === "ー" || c === "～").length;
        if (sameCount / surface.length >= 0.6) return true;
      }
      // Chung: 3 ký tự liên tiếp giống nhau → nhiễu (aaaa, ぺぺぺ)
      if (/^(.)\1{2,}/u.test(surface) || /(.)\1{2,}/u.test(surface) && surface.length >= 5) {
        // Nếu surface không chứa Kanji thì coi là nhiễu
        if (!/\p{Script=Han}/u.test(surface)) return true;
      }
    }
    if (/^ー+$/.test(surface) || /^～+$/.test(surface) || /^[ぁ-んァ-ン]{5,}$/.test(surface) && new Set([...surface]).size <= 2) return true;
  }
  // reading="*" trước đây loại hết → quá gắt với tên riêng katakana/kanji
  // Chỉ loại khi pos là 助詞/助動詞/記号 hoặc surface là hiragana 1-2 ký tự vô nghĩa
  if ((reading === "*" || reading === "") && surface.length <= 2) {
    const isKanji = /\p{Script=Han}/u.test(surface);
    const isKatakana = /^[ァ-ンー]+$/u.test(surface);
    if (isKanji && pos.startsWith("名詞")) return false;
    if (isKatakana && surface.length >= 2) return false;
    if (HIRAGANA_ONLY_REGEX.test(surface) && surface.length <= 2) return true;
    if (pos.startsWith("名詞") && surface.length >= 3) return false;
    return true;
  }
  if (reading === "*" || reading === "") {
    if (pos.startsWith("名詞") || pos.startsWith("動詞")) return false;
    return true;
  }
  // Lặp ký tự: おおお, ああ, アア → bỏ
  if (REPEATED_CHAR_REGEX.test(surface) || REPEATED_CHAR_REGEX.test(basic)) return true;
  // Hiragana 1-2 ký tự lặp như おお, ああ đã bị block ở trên nhưng bắt thêm
  if (surface.length <= 2 && HIRAGANA_ONLY_REGEX.test(surface) && surface.length === 2 && surface[0] === surface[1]) return true;
  // Mảnh rút gọn TE lẻ (てる/でいる/とく…): đã tách khỏi cụm thì bỏ,
  // stem trước đó tự về từ điển qua basic_form (食べ|てる → 食べる)
  if (/^(てる|でる|とく|どく|ている|でいる)$/u.test(surface)) return true;
  // Tồn tại từ đơn bare (いる/ある): sơ cấp + nhiễu sau TE-nối → bỏ
  // (dạng chia いた/あった… vẫn giữ vì surface ≠ basic)
  if (surface === basic && (TRIVIAL_EXISTENCE.has(basic) || TRIVIAL_EXISTENCE.has(surface))) return true;
  // 1 ký tự → loại, nhưng giữ Kanji 1 ký tự có nghĩa như 私, 耳 (kiểm tra Kanji)
  if (surface.length <= 1 && basic.length <= 1) {
    const baseForOne = pos.split("-")[0]?.trim() ?? pos;
    const isKanji = /\p{Script=Han}/u.test(surface);
    if (isKanji && baseForOne === "名詞") return false;
    return true;
  }

  if (isNumericSurface(surface)) return true;
  // PUNCT chỉ áp cho surface, không loại basic="*" vô tội
  if (PUNCT_REGEX.test(surface)) return true;
  // Tên riêng (人名/地域/組織…): luôn giữ, tách nghĩa riêng ở pipeline (không tra từ điển)
  if (getProperNounKind(token) !== null) return false;
  const basePos = pos.split("-")[0]?.trim() ?? pos;
  if (BLOCKED_POS_MAP[basePos]) return true;
  if (!isUsefulPos(pos)) return true;
  // basic là "*" thì không check PUNCT (đã xử lý ở trên) — tránh loại tên riêng
  if (basic !== "*" && PUNCT_REGEX.test(basic)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Từ kana phổ thông nhưng viết bằng kanji (当て字): 成程→なるほど, 何故→なぜ…
// Kuromoji hay tag nhầm thành tên riêng (成|固有名詞/地域 + 程 → "Tên địa danh: 成程"),
// hoặc tag phó từ/đại từ (なぜ/どこ) khiến tooltip không tra được.
// Chuẩn hóa basic về dạng kana để tra đúng nghĩa.
// ---------------------------------------------------------------------------

/** Mặt kanji → dạng kana chuẩn (JMdict cũng quy về kana). */
export const ATEJI_KANA_READING: Record<string, string> = {
  "成程": "なるほど", "成ほど": "なるほど",
  "何故": "なぜ", "何処": "どこ", "何時": "いつ", "何方": "どちら",
  "如何": "どう", "何れ": "いずれ",
  "此れ": "これ", "其れ": "それ", "彼れ": "あれ",
  "此処": "ここ", "其処": "そこ", "彼処": "あそこ",
  "誰": "だれ", "何": "なに",
  "殆ど": "ほとんど", "全て": "すべて", "総て": "すべて",
  "随分": "ずいぶん", "結構": "けっこう", "多分": "たぶん",
  "矢張り": "やはり", "沢山": "たくさん",
  "折角": "せっかく", "暫く": "しばらく", "丁度": "ちょうど",
  "全く": "まったく", "全然": "ぜんぜん", "余り": "あまり",
  "流石": "さすが", "例えば": "たとえば", "若し": "もし",
  "寧ろ": "むしろ", "敢えて": "あえて", "遂に": "ついに",
  "偶に": "たまに", "既に": "すでに", "常に": "つねに",
  "早速": "さっそく", "漸く": "やっと", "儘": "まま", "迄": "まで",
  "所為": "せい", "度々": "たびたび", "屡々": "しばしば",
  "偶々": "たまたま", "様々": "さまざま", "未だ": "まだ",
  "先ず": "まず", "概ね": "おおむね", "主に": "おもに",
  "互いに": "たがいに", "各々": "おのおの", "徐々に": "じょじょに",
  "僅か": "わずか", "辛うじて": "かろうじて", "可成り": "かなり",
  "凡そ": "およそ", "大方": "おおかた", "大抵": "たいてい",
  "大いに": "おおいに", "直ちに": "ただちに", "直ぐ": "すぐ",
  "忽ち": "たちまち", "俄に": "にわかに", "決して": "けっして",
};

/** Mọi mặt chữ kana/kanji của nhóm trên — luôn cho tra cứu (kể cả phó từ/đại từ). */
const ATEJI_KNOWN = new Set<string>([
  ...Object.keys(ATEJI_KANA_READING),
  ...Object.values(ATEJI_KANA_READING),
]);

export function isCommonKanaWord(surface: string, basic?: string): boolean {
  const s = (surface ?? "").trim();
  const b = (basic ?? "").trim();
  return (s !== "" && ATEJI_KNOWN.has(s)) || (b !== "" && ATEJI_KNOWN.has(b));
}

/** Đưa token kanji về basic kana + xóa tag tên riêng (nếu có). */
export function normalizeAteji<T extends MergeableToken>(t: T): T {
  const s = (t.surface_form ?? "").trim();
  const kana = ATEJI_KANA_READING[s];
  if (!kana) return t;
  return { ...t, basic_form: kana, pos_detail: "", pos_sub: "" };
}

export function getDedupKey(token: KuromojiToken): string {
  const basic = (token.basic_form ?? "").trim();
  if (basic && basic !== "*") return basic;
  return (token.surface_form ?? "").trim();
}

// ---------------------------------------------------------------------------
// Gộp cụm katakana + hiragana thành 1 từ vựng (slang động từ hóa).
// VD: kuromoji chẻ「ジェラってる」→ ジェラ | って | る, tra riêng ジェラ ra "gelatin" (sai).
// Gộp lại → Gemini thấy cả cụm + câu mẫu → "đang ghen" (đúng).
// Quy tắc: stem katakana ≥2 ký tự + đuôi hiragana là dạng chia động từ
// (る/り/た/ない/ます/たい/れる… hoặc thể て/で). Không gộp trợ từ thật:
// テレビ+を, スーパー+で(助詞) → giữ nguyên.
//
// Thêm: gộp CỤM ĐỘNG TỪ (compound verb + trợ động từ).
// VD:「聞き飽きたん」→ 聞き | 飽き | た | ん, tra lẻ từng mảnh sai nghĩa.
// Gộp → cả cụm + câu mẫu → Gemini dịch đúng ("nghe đến phát chán…").
// Quy tắc:
// - Starter: động từ đã chia KHÔNG phải thể TE (聞き/行き/食べ…; 込めて/行って/して không mở cụm).
// - Gộp: từ ghép stem+V (切り|替わる → 切り替わる), V+trợ động từ đơn (行き|ます, 食べ|たい, み|よう).
// - TE-nối KHÔNG gộp (込めて/行って/食べている không thành từ vựng; stem rớt ra
//   về thể từ điển qua basic_form: 込め→込める; てる/いる/ある lẻ bị loại ở dưới).
// Dừng ở: trợ từ thật (を/に/が/は…), danh từ, ký hiệu, copula (だ/です),
// và ん cuối cụm (…たん → lấy cả �ん rồi dừng).
// ---------------------------------------------------------------------------

const KATAKANA_STEM_RE = /^[ァ-ンー]{2,}$/u;
const HIRAGANA_PIECE_RE = /^[ぁ-んっ]{1,4}$/u;
const HARD_BLOCKED_PIECE = new Set(["記号", "空白", "感動詞", "unknown", "フィラー", "その他", "接頭詞", "接尾詞"]);
const TE_PIECES = new Set(["って", "て", "で"]);
const VERB_END_RE = /(る|り|た|ない|たい|ます|れる|られる)$/u;
const TAIL_RE = /^((っ)?(て|で)(る|た|ます)?|(って|て|で)|る|り|た|ない|たい|ます|れる|られる)$/u;
const MAX_MERGED_LEN = 14;
// Động từ phụ (subsidiary) — đứng sau vẫn thuộc cùng cụm (〜ている, 〜てしまう…)
const SUBSIDIARY_BASICS = new Set([
  "いる", "ある", "おく", "みる", "しまう", "いく", "ゆく", "くる",
  "もらう", "くれる", "あげる", "やる", "なさる", "くださる",
]);
// Nối từ 助詞 được phép trong cụm: chỉ ば (điều kiện, dạng chia đơn).
// TE-nối (て/で/ても/でも/ったり/って) KHÔNG gộp — 込めて/行って không thành từ vựng,
// stem te-form rớt ra sẽ về thể từ điển qua basic_form (込め→込める).
const CLUSTER_CONNECTIVES = new Set(["ば"]);
// Trợ động từ rút gọn từ TE (〜ちゃう/〜じゃう): không gộp, rớt ra để stem về từ điển
const TE_CONTRACTION_AUX = new Set(["ちゃう", "じゃう", "ちまう", "じまう", "ちゃった", "じゃった"]);
// Động từ phi tự lập rút gọn từ TE (〜てる/〜とく/〜ている): không gộp
const TE_CONTRACTION_NONJITAI = new Set(["てる", "でる", "とく", "どく", "ている", "でいる"]);
// Tồn tại từ đơn (いる/ある bare): quá sơ cấp + gây nhiễu sau TE → bỏ khỏi từ vựng
const TRIVIAL_EXISTENCE = new Set(["いる", "ある"]);
const COPULA_SURFACES = new Set(["だ", "です", "である", "であります"]);
const MAX_CLUSTER_PIECES = 6;
const MAX_CLUSTER_LEN = 16;

export type MergeableToken = {
  surface_form: string;
  basic_form?: string;
  reading?: string;
  pos?: string;
  /** pos_detail_1 (VD 固有名詞) — giữ qua các bước gộp để nhận diện tên riêng */
  pos_detail?: string;
  /** pos_detail_2 (VD 人名/地域/組織) */
  pos_sub?: string;
};

/** Loại tên riêng rút từ chi tiết ipadic, null nếu không phải tên riêng. */
export type ProperNounKind = "person" | "place" | "org" | "proper";

export function getProperNounKind(t: {
  pos?: string;
  pos_detail?: string;
  pos_sub?: string;
  surface_form?: string;
  basic_form?: string;
}): ProperNounKind | null {
  // Từ kana phổ thông viết bằng kanji (成程=なるほど, 何故=なぜ…):
  // kuromoji hay tag nhầm 固有名詞/地域 → KHÔNG phải tên riêng, cho tra nghĩa thường
  if (isCommonKanaWord((t.surface_form ?? "").trim(), (t.basic_form ?? "").trim())) return null;
  // 固有名詞 chỉ tồn tại dưới 名詞 — chặn token đã bị gộp/đổi pos (VD cụm động từ)
  if (!(t.pos ?? "").startsWith("名詞")) return null;
  if ((t.pos_detail ?? "") !== "固有名詞") return null;
  switch (t.pos_sub ?? "") {
    case "人名":
      return "person";
    case "地域":
      return "place";
    case "組織":
      return "org";
    default:
      return "proper";
  }
}

export const PROPER_KIND_LABEL: Record<ProperNounKind, string> = {
  person: "người",
  place: "địa danh",
  org: "tổ chức",
  proper: "riêng",
};

/** Nghĩa cố định cho tên riêng — không tra từ điển (tránh dịch sai tên người). */
export function buildProperNounMeaning(word: string, kind: ProperNounKind | null): string {
  const w = (word ?? "").trim() || "—";
  if (!kind) return w;
  return `Tên ${PROPER_KIND_LABEL[kind]}: ${w}`;
}

/**
 * Đọc loại tên riêng từ nghĩa đã lưu — gộp mọi loại (người/địa danh/tổ chức)
 * thành "proper" duy nhất cho dropdown loại từ.
 * Từ vựng thường → null.
 */
export function parseProperKindFromMeaning(meaning: string): ProperNounKind | null {
  const m = (meaning ?? "").trim();
  if (!m.startsWith("Tên ")) return null;
  if (
    m.startsWith("Tên người:") ||
    m.startsWith("Tên địa danh:") ||
    m.startsWith("Tên tổ chức:") ||
    m.startsWith("Tên riêng:")
  ) {
    return "proper";
  }
  return null;
}

function pieceBasePos(pos: string): string {
  return (pos ?? "").split("-")[0]?.trim() ?? "";
}

function isParticlePos(pos: string): boolean {
  const b = pieceBasePos(pos);
  return b === "助詞" || b === "助動詞";
}

/** Stem đủ điều kiện gộp — nới hơn isSkippableToken: cho phép stem lặp ký tự
 *  (ググ, サボ…) MIỄN là có đuôi động từ đi kèm; không có đuôi thì luật noise cũ vẫn loại. */
function isMergeableStem(t: MergeableToken): boolean {
  const s = (t.surface_form ?? "").trim();
  if (!s || !KATAKANA_STEM_RE.test(s) || s.length > 6) return false;
  if (NOISE_WORDS.has(s)) return false;
  if (/^ー+$/.test(s) || /^～+$/.test(s)) return false;
  const base = pieceBasePos(t.pos ?? "");
  if (HARD_BLOCKED_PIECE.has(base)) return false;
  if (isParticlePos(t.pos ?? "")) return false;
  return true;
}

function isSuffixToken(t: MergeableToken): boolean {
  const pos = (t.pos ?? "").trim();
  const detail = (t.pos_detail ?? "").trim();
  if (pos.startsWith("接尾詞") || detail === "接尾詞") return true;
  // kuromoji ipadic: さ/達/的… có pos="名詞", pos_detail_1="接尾"
  if (detail === "接尾") return true;
  // Fallback cache cũ (tokenizeAction v1 strip pos_detail): さ/み reading サ/ミ + pos 名詞
  const surface = (t.surface_form ?? "").trim();
  const reading = (t.reading ?? "").trim();
  if ((surface === "さ" || surface === "み") && pos.startsWith("名詞") && (reading === "サ" || reading === "ミ" || reading === surface)) return true;
  return false;
}

/** Hậu tố danh từ hóa tính từ: さ/み (美し+さ→美しさ, 強+さ→強さ, 美し+み→美しみ). */
function isNominalizerSaMi(surface: string, t: MergeableToken): boolean {
  if (surface !== "さ" && surface !== "み") return false;
  return isSuffixToken(t);
}

/** Stem tính từ có thể +さ/み: 形容詞活用語幹 (美し/強/楽し, basic 美しい/強い…)
 *  hoặc語幹 tính từ đuôi な (大切/静か — 名詞/形容動詞語幹). */
function isAdjectivalNominalizePrev(t: MergeableToken): boolean {
  const pos = (t.pos ?? "").trim();
  const detail = (t.pos_detail ?? "").trim();
  const surface = (t.surface_form ?? "").trim();
  if (!surface || surface.length > 8) return false;
  if (pos.startsWith("形容詞")) return true;
  // な-adj stem: kuromoji tag 名詞 + 形容動詞語幹 (大切, 静か)
  if (pos.startsWith("名詞") && detail === "形容動詞語幹") return true;
  // Fallback cache cũ (mất detail): danh từ 2-4 chữ trước さ/み coi như stem な-adj
  // (0b cũng đã gộp trường hợp Hán/Kata; nhánh này phủ stem hiragana còn lại)
  if (pos.startsWith("名詞") && !detail && surface.length >= 2 && surface.length <= 4) return true;
  return false;
}

export function mergeMixedScriptTokens<T extends MergeableToken>(tokens: T[]): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < tokens.length) {
    // 0a) Tính từ + さ/み → danh từ (美し|さ → 美しさ, 大切|さ → 大切さ)
    // Kuromoji chẻ 美し(形容詞, basic 美しい) + さ(名詞/接尾), hover lẻ từng mảnh sai nghĩa.
    {
      const suf = tokens[i];
      const sufSurface = (suf.surface_form ?? "").trim();
      if (sufSurface && isNominalizerSaMi(sufSurface, suf) && out.length > 0) {
        const prev = out[out.length - 1];
        if (prev && isAdjectivalNominalizePrev(prev)) {
          const prevSurface = (prev.surface_form ?? "").trim();
          if (prevSurface && prevSurface.length + sufSurface.length <= 10) {
            const mergedSurface = prevSurface + sufSurface;
            out[out.length - 1] = {
              ...prev,
              surface_form: mergedSurface,
              basic_form: mergedSurface,
              reading: ((prev.reading ?? "").trim() || prevSurface) + ((suf.reading ?? "").trim() || sufSurface),
              pos: "名詞",
            };
            i++;
            continue;
          }
        }
      }
    }
    // 0b) Tiếp vĩ ngữ (達/的/化…): dính vào từ vừa gộp (子供|達 → 子供達)
    const suf = tokens[i];
    const sufSurface = (suf.surface_form ?? "").trim();
    if (
      sufSurface &&
      isSuffixToken(suf) &&
      sufSurface.length <= 2 &&
      out.length > 0
    ) {
      const prev = out[out.length - 1];
      const prevSurface = (prev.surface_form ?? "").trim();
      if (
        prevSurface &&
        /[\p{Script=Han}ァ-ンー]$/u.test(prevSurface) &&
        prevSurface.length + sufSurface.length <= 8
      ) {
        const mergedSurface = prevSurface + sufSurface;
        out[out.length - 1] = {
          ...prev,
          surface_form: mergedSurface,
          basic_form: mergedSurface,
          reading: ((prev.reading ?? "").trim() || prevSurface) + ((suf.reading ?? "").trim() || sufSurface),
        };
        i++;
        continue;
      }
    }
    // 1) Tiếp đầu ngữ (未|熟 → 未熟, 無|ジョウ → 無ジョウ)
    const pre = tryMergePrefix(tokens, i);
    if (pre) {
      out.push(pre.token);
      i = pre.next;
      continue;
    }
    // 2) Cụm động từ (切り替わる, 聞き飽きたん, 行きます…; TE-nối thì không)
    const cluster = tryMergeVerbCluster(tokens, i);
    if (cluster) {
      out.push(cluster.token);
      i = cluster.next;
      continue;
    }
    // 3) Danh từ ghép Hán tự (耐水性, 新宿駅…; 昨日公園 thì không)
    const kanji = tryMergeKanjiCompound(tokens, i);
    if (kanji) {
      out.push(kanji.token);
      i = kanji.next;
      continue;
    }
    // 4) Cụm katakana + hiragana (ジェラってる, ググる…)
    const stem = tokens[i];
    const stemSurface = (stem.surface_form ?? "").trim();
    // Chỉ stem katakana có nghĩa (≥2 ký tự) mới xét gộp
    if (stemSurface && isMergeableStem(stem)) {
      const pieces: T[] = [];
      let run = "";
      let j = i + 1;
      while (j < tokens.length) {
        const p = tokens[j];
        const ps = (p.surface_form ?? "").trim();
        if (!ps || !HIRAGANA_PIECE_RE.test(ps)) break;
        const base = pieceBasePos(p.pos ?? "");
        if (HARD_BLOCKED_PIECE.has(base)) break;
        // Trợ từ thật (を/に/が…) chặn gộp — chỉ って/て/で được đi tiếp (dạng chia động từ)
        if (isParticlePos(p.pos ?? "") && !TE_PIECES.has(ps)) break;
        pieces.push(p);
        run += ps;
        j++;
        if (run.length > 8) break;
      }
      const hasParticle = pieces.some((p) => isParticlePos(p.pos ?? ""));
      const mergedLen = stemSurface.length + run.length;
      const okShape = pieces.length > 0 && TAIL_RE.test(run) && mergedLen <= MAX_MERGED_LEN;
      // Trợ từ đi kèm phải nằm trong dạng chia hoàn chỉnh (…ってる/…てる), không gộp bare スーパー+で
      const okParticle = !hasParticle || VERB_END_RE.test(run);
      if (okShape && okParticle) {
        const mergedSurface = stemSurface + run;
        const reading =
          [stem, ...pieces]
            .map((t) => (t.reading ?? "").trim())
            .filter((r) => r && r !== "*")
            .join("") || mergedSurface;
        const verbForm = VERB_END_RE.test(run);
        out.push({
          ...stem,
          surface_form: mergedSurface,
          basic_form: mergedSurface,
          reading,
          pos: verbForm ? "動詞" : stem.pos,
        });
        i = j;
        continue;
      }
    }
    out.push(stem);
    i++;
  }
  // Cuối: chuẩn hóa当て字 về kana (成程→なるほど, 何故→なぜ) + xóa tag tên riêng nhầm
  return out.map(normalizeAteji);
}

/** Từ loại được dính sau tiếp đầu ngữ (未/無/非/お/ご/第…): danh/động/tính từ, gồm cả katakana. */
const PREFIX_NEXT_OK = /^(名詞|動詞|形容詞)/u;
const KATAKANA_TOKEN_RE = /^[ァ-ンー]+$/u;

/**
 * Thử gộp tiếp đầu ngữ: 未|熟 → 未熟, 無|ジョウ → 無ジョウ.
 * Không gộp khi sau là trợ từ/ký hiệu/khoảng trắng (未|は → giữ nguyên).
 */
function tryMergePrefix<T extends MergeableToken>(
  tokens: T[],
  i: number
): { token: T; next: number } | null {
  const pre = tokens[i];
  const nxt = tokens[i + 1];
  if (!pre || !nxt) return null;
  if (!(pre.pos ?? "").startsWith("接頭詞")) return null;
  const preSurface = (pre.surface_form ?? "").trim();
  const nxtSurface = (nxt.surface_form ?? "").trim();
  if (!preSurface || !nxtSurface) return null;
  if (nxtSurface.length > 6 || preSurface.length + nxtSurface.length > 8) return null;
  const nxtPos = nxt.pos ?? "";
  if (!PREFIX_NEXT_OK.test(nxtPos) && !KATAKANA_TOKEN_RE.test(nxtSurface)) return null;
  const mergedSurface = preSurface + nxtSurface;
  const reading =
    ((pre.reading ?? "").trim() || preSurface) + ((nxt.reading ?? "").trim() || nxtSurface);
  return {
    token: {
      ...nxt,
      surface_form: mergedSurface,
      basic_form: mergedSurface,
      reading: reading || mergedSurface,
      pos: nxt.pos,
    },
    next: i + 2,
  };
}

/** Động từ đã chia (masu-stem 連用形…: surface ≠ basic) có thể mở cụm, VD 聞き/食べ/行き.
 *  Thể TE (込めて/行って/して) KHÔNG mở cụm — rớt ra để về từ điển qua basic_form. */
function isVerbClusterStarter(t: MergeableToken): boolean {
  const pos = t.pos ?? "";
  if (!pos.startsWith("動詞")) return false;
  const s = (t.surface_form ?? "").trim();
  const b = (t.basic_form ?? "").trim() || s;
  if (!s || s.length > 8) return false;
  if (/(て|で|って)$/u.test(s)) return false;
  if (s !== b) return true;
  return SUBSIDIARY_BASICS.has(b);
}

/**
 * Thử gộp cụm động từ từ vị trí i: starter + mảnh động từ/trợ động từ/て…
 * Trả {token, next} nếu gộp được ≥1 mảnh, ngược lại null.
 * Dừng ở: động từ nguyên thể độc lập (寝る), trợ từ thật, danh từ, ký hiệu,
 * copula (だ/です), và ん cuối cụm (…たん → lấy cả ん rồi dừng).
 */
function tryMergeVerbCluster<T extends MergeableToken>(
  tokens: T[],
  i: number
): { token: T; next: number } | null {
  const starter = tokens[i];
  if (!starter || !isVerbClusterStarter(starter)) return null;
  const startSurface = (starter.surface_form ?? "").trim();
  if (!startSurface) return null;

  const pieces: T[] = [];
  let j = i + 1;
  let closed = false;
  while (j < tokens.length && pieces.length < MAX_CLUSTER_PIECES && !closed) {
    const p = tokens[j];
    const ps = (p.surface_form ?? "").trim();
    const pb = (p.basic_form ?? "").trim() || ps;
    if (!ps || ps.length > 6) break;
    const base = pieceBasePos(p.pos ?? "");
    if (HARD_BLOCKED_PIECE.has(base)) break;
    const ppos = p.pos ?? "";

    if (base === "助動詞") {
      // Copula (だ/です) và rút gọn TE (ちゃう/じゃう) không thuộc cụm → dừng,
      // stem rớt ra về từ điển (食べ|ちゃう → 食べる)
      if (COPULA_SURFACES.has(ps) || TE_CONTRACTION_AUX.has(ps)) break;
      pieces.push(p);
      j++;
      continue;
    }
    if (ppos.startsWith("動詞") && ppos.includes("非自立")) {
      // Rút gọn TE (てる/とく) không gộp
      if (TE_CONTRACTION_NONJITAI.has(ps)) break;
      pieces.push(p);
      j++;
      continue;
    }
    if (ppos.startsWith("動詞")) {
      // Động từ tự lập luôn gộp sát sau stem: từ ghép (切り|替わる → 切り替わる),
      // V+V (泳ぎ|疲れた), V+phụ (み|よう). TE (て/で) đã bị chặn ở starter
      // nên không dán 2 hành động khác nhau lại (食べて|寝る: て chặn giữa).
      pieces.push(p);
      j++;
      continue;
    }
    if (base === "助詞") {
      if (ps === "ん") {
        pieces.push(p); // ん cuối cụm (…たん/…るん) → lấy rồi dừng
        j++;
        closed = true;
        continue;
      }
      if (CLUSTER_CONNECTIVES.has(ps)) {
        pieces.push(p);
        j++;
        continue;
      }
      break;
    }
    break;
  }

  if (pieces.length === 0) return null;
  const mergedSurface = startSurface + pieces.map((p) => (p.surface_form ?? "").trim()).join("");
  if (mergedSurface.length > MAX_CLUSTER_LEN) return null;
  const reading =
    [starter, ...pieces]
      .map((t) => (t.reading ?? "").trim())
      .filter((r) => r && r !== "*")
      .join("") || mergedSurface;
  return {
    token: {
      ...starter,
      surface_form: mergedSurface,
      basic_form: mergedSurface,
      reading,
      pos: "動詞",
    },
    next: j,
  };
}

export const ALLOWED_POS = ALLOWED_POS_MAP;
export const BLOCKED_POS = BLOCKED_POS_MAP;

// ---------------------------------------------------------------------------
// Gộp DANH TỪ GHÉP Hán tự bị kuromoji chẻ lẻ: 耐|水|性 → 耐水性, 新|宿 → 新宿,
// 大阪|市 → 大阪市. Tra cả cụm + câu mẫu mới ra nghĩa ("khả năng chống nước").
// Chống dán 2 từ khác nhau (昨日|公園 → giữ nguyên): chỉ gộp khi MỌI mảnh ≤2 chữ
// và CÓ ÍT NHẤT 1 mảnh 1 chữ (dấu hiệu từ bị chẻ), tổng ≤5 chữ.
// ---------------------------------------------------------------------------

const HAN_RE = /^\p{Script=Han}+$/u;
const MAX_KANJI_COMPOUND_LEN = 5;

function tryMergeKanjiCompound<T extends MergeableToken>(
  tokens: T[],
  i: number
): { token: T; next: number } | null {
  const first = tokens[i];
  const firstSurface = (first?.surface_form ?? "").trim();
  if (!firstSurface || !HAN_RE.test(firstSurface) || firstSurface.length > 2) return null;

  const pieces: T[] = [first];
  let total = firstSurface.length;
  let hasSingle = firstSurface.length === 1;
  let j = i + 1;
  while (j < tokens.length) {
    const p = tokens[j];
    const ps = (p.surface_form ?? "").trim();
    if (!ps || !HAN_RE.test(ps) || ps.length > 2) break;
    if (total + ps.length > MAX_KANJI_COMPOUND_LEN) break;
    pieces.push(p);
    total += ps.length;
    if (ps.length === 1) hasSingle = true;
    j++;
  }
  if (pieces.length < 2 || !hasSingle) return null;

  const mergedSurface = pieces.map((p) => (p.surface_form ?? "").trim()).join("");
  const reading =
    pieces
      .map((t) => (t.reading ?? "").trim())
      .filter((r) => r && r !== "*")
      .join("") || mergedSurface;
  return {
    token: {
      ...pieces[0],
      surface_form: mergedSurface,
      basic_form: mergedSurface,
      reading,
      pos: "名詞",
    },
    next: j,
  };
}
