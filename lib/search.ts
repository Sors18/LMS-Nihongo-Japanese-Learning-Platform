// ---------------------------------------------------------------------------
// Search helpers — fuzzy / accent-insensitive (gần đúng, không phân biệt dấu)
// ---------------------------------------------------------------------------
// Style copy từ lib/cache.ts: comment block, typing rõ ràng, không allocate thừa.
// Dùng cho: app/api/vocab (search param), dashboard / admin client filter.
//
// - normalizeSearch: NFD bỏ dấu + lower + trim
// - fuzzyContains: haystack.toLowerCase().includes(needle.toLowerCase()) + bỏ dấu + tách từ
// ---------------------------------------------------------------------------

/**
 * Chuẩn hoá chuỗi để so sánh gần đúng:
 * - NFD bỏ dấu (loại bỏ combining marks \u0300-\u036f)
 * - lower + trim
 * - xử lý riêng "đ/Đ" → "d" cho tiếng Việt (Đ không nằm trong combining marks)
 */
export function normalizeSearch(str: string): string {
  if (typeof str !== "string") return "";
  if (!str) return "";
  // NFD tách base + dấu, sau đó xoá marks, lower, trim
  // Xử lý "đ" riêng sau khi lower
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}

/**
 * Kiểm tra haystack có chứa needle gần đúng hay không.
 * - Dùng normalizeSearch cho cả hai vế (bỏ dấu, lower, trim)
 * - Sau đó kiểm tra contains: `haystack.toLowerCase().includes(needle.toLowerCase())` ở dạng đã bỏ dấu
 * - Tách từ: needle được split theo whitespace, tất cả token phải xuất hiện trong haystack
 *   (ví dụ: haystack "xin chao viet nam", needle "chao nam" → true)
 *
 * @returns true nếu needle rỗng (không lọc), false nếu haystack rỗng mà needle có giá trị
 */
export function fuzzyContains(haystack: string, needle: string): boolean {
  if (typeof haystack !== "string" || typeof needle !== "string") return false;
  const h = normalizeSearch(haystack);
  const n = normalizeSearch(needle);
  // needle rỗng → coi như match tất cả (không lọc)
  if (!n) return true;
  if (!h) return false;
  // Tối ưu fast-path: needle 1 từ → chỉ cần includes
  if (!n.includes(" ")) return h.includes(n);
  // Tách từ: mọi token trong needle phải có trong haystack
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length === 1) return h.includes(tokens[0] as string);
  return tokens.every((tok) => h.includes(tok));
}

// ---------------------------------------------------------------------------
// Re-export alias nếu cần dùng tên khác ở caller
// ---------------------------------------------------------------------------
export const normalize = normalizeSearch;
export const containsFuzzy = fuzzyContains;
