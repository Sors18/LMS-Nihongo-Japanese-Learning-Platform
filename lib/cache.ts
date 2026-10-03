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

  constructor(defaultTtlMs = 3_600_000) {
    this.defaultTtlMs = defaultTtlMs;
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
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
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

// Global singletons — sống suốt server lifetime, không allocate per-request
export const tokenMemoryCache = new MemoryTTLCache<string, KuromojiToken[]>(3_600_000);
export const vocabMemoryCache = new MemoryTTLCache<string, unknown>(3_600_000);

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
