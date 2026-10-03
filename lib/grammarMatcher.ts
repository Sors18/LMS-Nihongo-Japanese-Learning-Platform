/**
 * Pure helper for matching Grammar.structure against subtitle text.
 * - Grammar.structure uses "〜" as wildcard placeholder (e.g. "〜は〜です").
 * - Matching rule: text.includes(structure.replace("〜","")) OR regex where "〜" → ".*"
 *
 * No DB access — usable from Server Actions, tests, or client helpers.
 */

/**
 * Escape RegExp special characters in a literal segment.
 */
export function escapeRegExp(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a RegExp from a Grammar structure where "〜" becomes ".*".
 * The resulting pattern is NOT anchored; it searches as substring.
 *
 * @example
 * buildGrammarRegex("〜は〜です") → /.*は.*です/u  → matches "私は田中です"
 */
export function buildGrammarRegex(structure: string): RegExp {
  const normalized = structure.trim();
  const parts = normalized.split("〜");
  const escapedParts = parts.map((p) => escapeRegExp(p));
  const pattern = escapedParts.join(".*");
  if (pattern === "" || pattern === "(?:)") {
    return new RegExp("(?!.*)", "u");
  }
  const stripped = normalized.replace(/〜/g, "");
  if (stripped === "") {
    return new RegExp("(?!.*)", "u");
  }
  return new RegExp(pattern, "u");
}

/**
 * Check whether `text` matches a single Grammar `structure`.
 * Implements spec: text.includes(structure.replace("〜","")) OR regex "〜" → ".*"
 */
export function matchesGrammar(text: string, structure: string): boolean {
  if (typeof text !== "string" || typeof structure !== "string") return false;
  const t = text.trim();
  const s = structure.trim();
  if (!t || !s) return false;

  const stripped = s.replace(/〜/g, "");
  if (stripped.length > 0 && t.includes(stripped)) {
    return true;
  }
  if (stripped === "") return false;

  try {
    const re = buildGrammarRegex(s);
    if (re.source === "(?!.*)") return false;
    if (re.test(t)) return true;
  } catch {
    // ignore
  }
  // Nới lỏng: nếu bất kỳ segment nào (tách bởi 〜) dài >=2 ký tự xuất hiện trong text thì cũng tính match
  // Giúp "〜たいです" match "食べたい" (chỉ có "たい"), "〜ことができる" match "ことができる"
  const segments = s.split("〜").map((p) => p.trim()).filter((p) => p.length >= 2);
  for (const seg of segments) {
    if (t.includes(seg)) return true;
    // Cho phép thiếu です/だ ở cuối: "たいです" → "たい"
    const withoutDesu = seg.replace(/です$|だ$|ます$|でした$|である$/u, "");
    if (withoutDesu.length >= 2 && t.includes(withoutDesu)) return true;
  }
  return false;
}

/**
 * Filter a list of structures to those matching the text.
 * Helper for unit tests without DB.
 */
export function filterMatchingStructures(text: string, structures: string[]): string[] {
  return structures.filter((s) => matchesGrammar(text, s));
}
