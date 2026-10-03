/**
 * Phụ đề song ngữ: câu Nhật + bản dịch Việt cách dòng xuống.
 * VD paste:
 *   だがドルゥヴのように無差別に人間を襲う泳者を
 *   Nhưng không thể để người chơi...
 * Dòng có chữ Nhật → câu JP; dòng không chữ Nhật ngay sau → bản dịch của câu đó.
 * Client-safe (không import server-only) — dùng chung cho parse + hiển thị.
 */

/** Có chữ Nhật (kana/kanji) không. */
export function hasJapanese(text: string): boolean {
  return /[぀-ヿ一-鿿々〆]/.test(text ?? "");
}

const VI_DIACRITIC_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const JP_CHAR_RE = /[぀-ヿ一-鿿々〆]/g;
const LEADING_PUNCT_RE = /^[\s。、！？!?,;:\-–—~～「」『』（）()．・…]+/u;

/** Dòng thuần Việt (có dấu Việt, không chữ Nhật) — hiển thị nhỏ như bản dịch, khỏi tokenize. */
export function isVietnameseOnly(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t || hasJapanese(t)) return false;
  return VI_DIACRITIC_RE.test(t);
}

/**
 * Tách đuôi Việt dính liền sau câu Nhật trên cùng 1 dòng:
 * "…しなければならない nên phải thêm…" → {jp, vi}.
 * Chỉ tách khi đuôi bắt đầu bằng chữ Latin và chứa dấu Việt
 * (tránh cắt nhầm romaji như "ありがとう konnichiwa").
 */
export function splitTrailingVietnamese(text: string): { jp: string; vi: string | null } {
  const t = (text ?? "").trim();
  if (!t || !hasJapanese(t)) return { jp: t, vi: null };
  let lastJp = -1;
  JP_CHAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JP_CHAR_RE.exec(t)) !== null) lastJp = m.index;
  if (lastJp < 0) return { jp: t, vi: null };
  const tail = t.slice(lastJp + 1).replace(LEADING_PUNCT_RE, "").trim();
  if (!tail) return { jp: t, vi: null };
  if (!/[A-Za-z]/.test(tail[0] ?? "") || !VI_DIACRITIC_RE.test(tail)) return { jp: t, vi: null };
  const jp = t.slice(0, lastJp + 1).trim();
  if (!jp) return { jp: t, vi: null };
  return { jp, vi: tail };
}

export type BilingualPair = { jp: string; vi: string | null };

/**
 * Ghép các dòng xen kẽ JP/VI thành từng cặp.
 * - Dòng JP mở cue mới (flush cue trước).
 * - Dòng không-Nhật: là bản dịch của cue hiện tại (chưa có vi) hoặc nối tiếp bản dịch (có rồi).
 * - Dòng VI mồ côi (chưa có cue JP nào) → bỏ qua.
 */
export function pairBilingualLines(lines: string[]): BilingualPair[] {
  const cleaned = (lines ?? []).map((l) => (l ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) return [];
  // Không có chữ Nhật (romaji/EN thuần) → mỗi dòng 1 cue như cũ, không ghép dịch
  if (!cleaned.some((l) => hasJapanese(l))) {
    return cleaned.map((jp) => ({ jp, vi: null }));
  }
  const pairs: BilingualPair[] = [];
  let current: BilingualPair | null = null;
  const flush = () => {
    if (current && (current.jp || current.vi)) pairs.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = (raw ?? "").trim();
    if (!line) continue;
    if (hasJapanese(line)) {
      flush();
      // Dòng Nhật có thể dính đuôi Việt cùng dòng → tách ngay
      const split = splitTrailingVietnamese(line);
      current = { jp: split.jp, vi: split.vi };
    } else if (current) {
      current.vi = current.vi ? `${current.vi} ${line}` : line;
    }
    // else: VI mồ côi trước mọi câu JP → bỏ
  }
  flush();
  return pairs;
}

/**
 * Tách body 1 cue SRT (nhiều dòng) thành {jp, vi}:
 * các dòng Nhật gom làm câu JP, dòng còn lại làm bản dịch.
 * Cue thuần Latin (romaji/EN) → giữ nguyên làm câu JP, không tách.
 */
export function splitBilingualCueText(text: string): { jp: string; vi: string | null } {
  const lines = (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => hasJapanese(l))) {
    return { jp: lines.join("\n").trim(), vi: null };
  }
  const jpLines: string[] = [];
  const viParts: string[] = [];
  for (const l of lines) {
    if (!hasJapanese(l)) {
      viParts.push(l);
      continue;
    }
    // Dòng Nhật dính đuôi Việt → tách đuôi sang phần dịch
    const split = splitTrailingVietnamese(l);
    jpLines.push(split.jp);
    if (split.vi) viParts.push(split.vi);
  }
  const jp = jpLines.join("\n").trim();
  const vi = viParts.join(" ").trim();
  return { jp, vi: vi || null };
}

/** Ghép bản dịch vào sample gửi AI: "câu JP\nVI: bản dịch". */
export function sampleWithTranslation(jp: string, translation?: string | null): string {
  const t = (translation ?? "").trim();
  const j = (jp ?? "").trim();
  if (!j) return t;
  if (!t) return j;
  return `${j}\nVI: ${t.slice(0, 300)}`;
}
