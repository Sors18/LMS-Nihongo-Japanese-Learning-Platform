"use server";

import { lookupVocabSmart } from "@/lib/vocabLookup";

export type VocabLookupOpts = { reading?: string; sample?: string | null; properHint?: boolean };

/**
 * Lookup Vocabulary by surface word.
 * DB exact → contains → Gemini theo ngữ cảnh (upsert DB).
 * Kết hợp MemoryTTLCache để trả nhanh — tránh query DB lặp.
 */
export async function lookupVocab(word: string, opts?: VocabLookupOpts) {
  return lookupVocabSmart(word, opts);
}
export async function lookupVocabByReading(word: string, reading?: string, opts?: Omit<VocabLookupOpts, "reading">) {
  const w = word?.trim();
  if (!w) return null;
  return lookupVocabSmart(w, { reading, sample: opts?.sample });
}
