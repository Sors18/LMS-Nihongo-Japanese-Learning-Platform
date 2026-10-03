/**
 * Helper giờ phụ đề (dùng chung admin editor + panel).
 * formatMs: ms → "mm:ss.mmm" • parseMsInput: "mm:ss.mmm" | "m:ss" | số giây | số ms → ms.
 */

/** ms → "mm:ss.mmm" (VD 65000 → "01:05.000"). */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00.000";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const msRem = Math.floor(ms % 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msRem).padStart(3, "0")}`;
}

/**
 * Parse ô nhập giờ admin: "01:05.000" | "1:05" | "65" (=65 giây) | "65000ms".
 * Trả ms (số nguyên ≥0), hoặc null nếu sai định dạng.
 */
export function parseMsInput(raw: string): number | null {
  const t = (raw ?? "").trim().toLowerCase().replace(",", ".");
  if (!t) return null;
  // "65000ms"
  const msMatch = t.match(/^(\d+(?:\.\d+)?)\s*ms$/);
  if (msMatch) {
    const v = Math.round(Number(msMatch[1]));
    return Number.isFinite(v) && v >= 0 ? v : null;
  }
  // "mm:ss.mmm" hoặc "m:ss"
  const tsMatch = t.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (tsMatch) {
    const m = Number(tsMatch[1]);
    const s = Number(tsMatch[2]);
    const frac = tsMatch[3] ?? "";
    if (!Number.isFinite(m) || !Number.isFinite(s) || s >= 60) return null;
    const ms = m * 60_000 + s * 1000 + Number((frac + "000").slice(0, 3));
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  }
  // số thuần = giây (cho phép thập phân)
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    const v = Math.round(Number(t) * 1000);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }
  return null;
}
