/**
 * Tách 1 dòng phụ đề thành các câu thoại theo marker tên nhân vật: (乙骨) / （悠仁）.
 * Một khung thời gian chứa 2 nhân vật nói → xuống dòng mỗi người, tránh loạn.
 * - Chỉ tách khi có ≥2 marker tên (1 marker đầu dòng = 1 người nói, giữ nguyên).
 * - Marker SFX quen thuộc ((笑), (汗)…) không tính là tên → tránh tách nhầm.
 * Client-safe (không import server-only).
 */

// Marker: ngoặc nửa/full-width chứa 1-12 ký tự, không ngoặc lồng, không xuống dòng
const SPEAKER_RE = /[（(]([^（）()\n]{1,12})[）)]/g;

// Marker hiệu ứng, không phải tên người — bỏ qua khi đếm/tách
const SFX_MARKERS = new Set([
  "笑", "大笑", "苦笑", "泣", "号泣", "汗", "驚", "照", "怒", "叫", "叫び",
  "歌", "鼻歌", "音", "効果音", "BGM", "音楽", "拍手", "歓声", "どよめき",
  "心の声", "モノローグ", "ナレーション", "回想", "電話", "アナウンス",
]);

function isNameMarker(content: string): boolean {
  const t = (content ?? "").trim();
  if (!t) return false;
  if (SFX_MARKERS.has(t)) return false;
  // Tên phải có chữ (kanji/kana/latin), không phải số/ký hiệu thuần
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u.test(t);
}

/**
 * Tách text thành các đoạn thoại, mỗi đoạn bắt đầu bằng marker tên của người nói.
 * Trả về [text] nguyên vẹn khi không đủ điều kiện tách.
 */
export function splitSpeakerSegments(text: string): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const matches = [...t.matchAll(SPEAKER_RE)].filter((m) => isNameMarker(m[1] ?? ""));
  if (matches.length < 2) return [t];
  const segments: string[] = [];
  // Text trước marker đầu (dẫn truyện) giữ làm đoạn mở đầu
  const firstIdx = matches[0].index ?? 0;
  if (firstIdx > 0) {
    const head = t.slice(0, firstIdx).trim();
    if (head) segments.push(head);
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? t.length) : t.length;
    const seg = t.slice(start, end).trim();
    if (seg) segments.push(seg);
  }
  return segments.length > 0 ? segments : [t];
}
