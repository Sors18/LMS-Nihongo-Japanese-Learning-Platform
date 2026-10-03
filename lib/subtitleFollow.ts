/**
 * Follow-mode cho SubtitlePanel: phát hiện user tự kéo khỏi câu đang phát.
 * Dùng Math.abs nên KÉO LÊN hay KÉO XUỐNG đều tính như nhau:
 * - active trôi lên trên viewport (user kéo xuống đọc tiếp) → lệch âm
 * - active tụt xuống dưới viewport (user kéo lên đọc lại) → lệch dương
 * Client-safe, pure (test được không cần DOM).
 */

/** Ngưỡng lệch (px) so với vị trí ghim (top panel + 8px) thì coi là đang đọc tự do */
export const FOLLOW_THRESHOLD_PX = 80;

/**
 * User có đang cuộn tự do (lệch khỏi câu active quá ngưỡng) không?
 * @param activeTop top của câu active (getBoundingClientRect().top)
 * @param containerTop top của panel (getBoundingClientRect().top)
 */
export function scrolledAwayFromActive(
  activeTop: number,
  containerTop: number,
  threshold: number = FOLLOW_THRESHOLD_PX
): boolean {
  return Math.abs(activeTop - containerTop - 8) > threshold;
}

/** Bán kính ưu tiên quanh điểm tua: 10 sub trước + 10 sub sau. */
export const SEEK_WINDOW = 10;

/** Số dòng lấy ngay sau điểm tua khi vừa tua (điểm tua + N dòng sau), 1 batch duy nhất. */
export const SEEK_FOCUS_AFTER = 5;

/** Nhảy active quá N dòng → coi là tua (không phải chạy tự nhiên từng câu). */
export const SEEK_JUMP_DELTA = 3;

/**
 * Sắp thiếu token theo gần điểm tua trước: khi tua xa, 10 sub trước/sau
 * đoạn tua load trước để hover/tra từ ngay; phần xa ở trên load dần sau.
 * activeIndex < 0 (không có câu active) → giữ nguyên thứ tự.
 */
export function nearestIndicesFirst(indices: number[], activeIndex: number): number[] {
  if (activeIndex < 0 || indices.length === 0) return [...indices];
  return [...indices].sort((a, b) => Math.abs(a - activeIndex) - Math.abs(b - activeIndex));
}

/**
 * Cửa sổ focus khi vừa tua: điểm tua + SEEK_FOCUS_AFTER dòng sau, 1 batch duy nhất
 * để hiện ngay (thay vì rải từng dòng). Kẹp trong [0, sliceLength).
 */
export function seekFocusWindow(activeIndex: number, sliceLength: number, after: number = SEEK_FOCUS_AFTER): number[] {
  if (activeIndex < 0 || sliceLength <= 0) return [];
  const out: number[] = [];
  for (let k = activeIndex; k <= Math.min(activeIndex + Math.max(0, after), sliceLength - 1); k++) {
    out.push(k);
  }
  return out;
}

/** activeIndex có phải vừa nhảy tua (không phải chạy tự nhiên) so với lần trước. */
export function isSeekJump(prevActiveIndex: number, activeIndex: number): boolean {
  if (activeIndex < 0) return false;
  if (prevActiveIndex < 0) return activeIndex > SEEK_WINDOW;
  return Math.abs(activeIndex - prevActiveIndex) > SEEK_JUMP_DELTA;
}
