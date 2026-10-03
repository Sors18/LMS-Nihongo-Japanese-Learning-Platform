"use server";

import "server-only";

import { unstable_cache } from "next/cache";
import { tokenizeJapanese } from "@/lib/kuromoji";
import type { KuromojiToken } from "@/lib/kuromoji";
import { getCachedTokens } from "@/lib/cache";
import { mergeMixedScriptTokens } from "@/lib/vocabFilter";

// ---------------------------------------------------------------------------
// Types — tương thích cả spec Slice C và contract Slice D (FavouriteDog)
// ---------------------------------------------------------------------------

export type TokenResult = KuromojiToken & {
  /** alias của surface_form để TokenizedSubtitle dùng word */
  word: string;
  /** alias của basic_form để client dùng basic */
  basic: string;
};

// ---------------------------------------------------------------------------
// Persistent cache via Next unstable_cache (revalidate 3600s)
// Key = text, không re-build dict khi gọi lại
// ---------------------------------------------------------------------------

const cachedTokenizeRaw = unstable_cache(
  async (text: string): Promise<KuromojiToken[]> => {
    // Bên trong dùng React cache + MemoryTTLCache để dedup per-request
    return getCachedTokens(text);
  },
  ["kuromoji-tokenize-v2"],
  { revalidate: 3600, tags: ["kuromoji"] }
);

// Fallback trực tiếp nếu unstable_cache không khả dụng trong test/edge
async function tokenizeWithFallback(text: string): Promise<KuromojiToken[]> {
  try {
    return await cachedTokenizeRaw(text);
  } catch {
    // fallback: gọi trực tiếp tokenizeJapanese (vẫn có singleton promise cache)
    return tokenizeJapanese(text);
  }
}

/**
 * Server Action — chạy SSR, không bao giờ chạy trên browser.
 * Tách câu tiếng Nhật thành tokens, có cache (gọi lại cùng text không re-build dict).
 * Đảm bảo "use server" không bị import nhầm trong client — chỉ gọi qua action này.
 *
 * @example
 * import { tokenizeAction } from "@/app/actions/tokenize";
 * const tokens = await tokenizeAction("こんにちは、はじめまして");
 */
export async function tokenizeAction(text: string): Promise<TokenResult[]> {
  "use server";

  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const raw = await tokenizeWithFallback(trimmed);
  // Gộp cụm + chuẩn hóa当て字 (成程→なるほど, xóa tag tên riêng nhầm) —
  // tooltip hover dùng tokens này nên phải merge ở đây, giống đường trích vocab.
  // Chỉ merge (không lọc bỏ) để câu hiển thị vẫn đủ chữ.
  const merged = mergeMixedScriptTokens(raw);

  return merged.map((t) => ({
    surface_form: t.surface_form,
    reading: t.reading,
    pos: t.pos,
    basic_form: t.basic_form,
    pos_detail: t.pos_detail ?? "",
    pos_sub: t.pos_sub ?? "",
    word: t.surface_form,
    basic: t.basic_form,
  }));
}

/**
 * Batch tokenize — 1 roundtrip cho cả danh sách phụ đề.
 * SubtitlePanel prefetch 1 lần để hover dòng nào cũng có tokens ngay,
 * thay vì N component con gọi N action riêng lẻ.
 * Cap 20 text/call để 1 batch lỗi/seek xa không dồn server kuromoji.
 */
const BATCH_MAX = 20;
export async function tokenizeBatchAction(texts: string[]): Promise<TokenResult[][]> {
  "use server";
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const cleaned = texts
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .slice(0, BATCH_MAX);
  return Promise.all(cleaned.map((t) => tokenizeAction(t)));
}

// Re-export helper cho code muốn dùng trực tiếp kuromoji token shape
export type { KuromojiToken };
