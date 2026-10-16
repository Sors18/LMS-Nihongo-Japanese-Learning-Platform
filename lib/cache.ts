import "server-only";

import { tokenizeJapanese } from "./kuromoji";
import type { KuromojiToken } from "./kuromoji";

// ---------------------------------------------------------------------------
// Simple in-memory Map with TTL — dùng cho vocab cache và token cache
// ---------------------------------------------------------------------------

type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

export class MemoryTTLCache<K, V> {
  private store = new Map<K, CacheEntry<V>>();
  private defaultTtlMs: number;
  private maxEntries: number;

  constructor(defaultTtlMs = 3_600_000, maxEntries = 1000) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = Math.max(1, maxEntries);
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    // Refresh vị trí LRU khi key đã tồn tại
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    // Chặn leak RAM: quá max → xóa oldest (Map giữ thứ tự insert) + quét expired
    if (this.store.size > this.maxEntries) {
      const over = this.store.size - this.maxEntries;
      let removed = 0;
      for (const k of this.store.keys()) {
        this.store.delete(k);
        if (++removed >= over) break;
      }
    }
    // Quét lười mỗi ~100 lần set để không tốn CPU per-request
    if (this.store.size % 100 === 0) this.sweepExpired();
  }

  /** Xóa entry hết hạn — gọi định kỳ, không chặn request. */
  sweepExpired(now = Date.now()): number {
    let removed = 0;
    this.store.forEach((entry, k) => {
      if (now > entry.expiresAt) {
        this.store.delete(k);
        removed++;
      }
    });
    return removed;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    const toDelete: K[] = [];
    this.store.forEach((entry, k) => {
      if (Date.now() > entry.expiresAt) toDelete.push(k);
    });
    toDelete.forEach((k) => this.store.delete(k));
    return this.store.size;
  }
}

// Global singletons — sống suốt server lifetime, có cap chống leak RAM.
// token: câu ngắn, trùng nhiều → 300 entries / 1h. vocab: từ lẻ → 2000 entries / 1h.
export const tokenMemoryCache = new MemoryTTLCache<string, KuromojiToken[]>(3_600_000, 300);
export const vocabMemoryCache = new MemoryTTLCache<string, unknown>(3_600_000, 2000);

// ---------------------------------------------------------------------------
// Cached token helper — dùng MemoryTTLCache cross-request + singleton tokenizer
// Kết hợp với React cache ở tầng Next nếu cần, nhưng ở đây dùng TTL Map để đơn giản
// và tránh lỗi types khi React.cache chưa có trong @types/react.
// tokenizeAction sẽ bọc thêm unstable_cache (revalidate 3600) ở tầng Server Action.
// ---------------------------------------------------------------------------

export async function getCachedTokens(text: string): Promise<KuromojiToken[]> {
  // Chuẩn hoá: xoá zero-width, NBSP, chuẩn hoá khoảng trắng
  const cleaned = text
    .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2060\u180E]/g, "")
    .replace(/\u3000/g, " ")
    .trim();
  const key = cleaned;
  if (!key) return [];
  const hit = tokenMemoryCache.get(key);
  if (hit) return hit;
  const tokens = await tokenizeJapanese(key);
  tokenMemoryCache.set(key, tokens);
  return tokens;
}

export async function getCachedVocab<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = vocabMemoryCache.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  const value = await loader();
  vocabMemoryCache.set(key, value);
  return value;
}

// Re-export alias cho spec: `export const getCachedTokens = cache(...)`
// Nếu muốn dùng React.cache, có thể bọc ngoài:
// import { cache } from "react"; export const getCachedTokensReact = cache(getCachedTokens);
