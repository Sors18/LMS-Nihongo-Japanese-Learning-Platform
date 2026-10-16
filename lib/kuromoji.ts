import "server-only";

import path from "path";
import fs from "fs";
import type { IpadicFeatures, Tokenizer } from "kuromoji";

export type KuromojiToken = {
  surface_form: string;
  reading: string;
  pos: string;
  basic_form: string;
  /** Chi tiết từ loại ipadic: pos_detail_1 (VD 固有名詞) — để nhận diện tên riêng */
  pos_detail?: string;
  /** Chi tiết cấp 2: pos_detail_2 (VD 人名/地域/組織/一般) */
  pos_sub?: string;
};

// Singleton promise cache — đảm bảo dict chỉ build 1 lần per server lifetime
let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;
let tokenizerInstance: Tokenizer<IpadicFeatures> | null = null;

function getDictPath(): string {
  // Cho phép override qua env để deploy nhẹ (VD gắn volume / dùng CDN dict)
  const override = (process.env.KUROMOJI_DIC_PATH ?? "").trim();
  if (override) return override;
  // Ưu tiên absolute path từ process.cwd(), fallback về spec relative path
  const absolute = path.join(process.cwd(), "node_modules", "kuromoji", "dict");
  try {
    if (fs.existsSync(absolute)) return absolute;
  } catch {
    // ignore
  }
  // Spec yêu cầu builder({dicPath: "node_modules/kuromoji/dict"})
  return "node_modules/kuromoji/dict";
}

/** Warmup không chặn request — gọi 1 lần lúc server boot để tránh cold-start ở request đầu. */
export function warmupTokenizer(): void {
  // Fire-and-forget: lỗi đã được log trong tokenizeJapanese fallback
  void buildTokenizer().catch(() => {});
}

// Timeout build dict — quá 15s coi như fail để request fallback char-split ngay
// thay vì treo server (quan trọng khi deploy RAM thấp / Vercel).
const BUILD_TIMEOUT_MS = Number(process.env.KUROMOJI_BUILD_TIMEOUT_MS ?? 15000) || 15000;

function buildTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (tokenizerInstance) return Promise.resolve(tokenizerInstance);
  if (tokenizerPromise) return tokenizerPromise;

  tokenizerPromise = new Promise((resolve, reject) => {
    try {
      // Dùng require để tránh bundler cố gắng bundle dict
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const kuromoji = require("kuromoji") as typeof import("kuromoji");
      const dicPath = getDictPath();

      // Kiểm tra sync trước khi build để fallback nhanh
      let dictExists = false;
      try {
        dictExists = fs.existsSync(dicPath);
      } catch {
        dictExists = true; // nếu không check được, thử build
      }
      if (!dictExists) {
        reject(new Error(`kuromoji dict not found at ${dicPath}`));
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`kuromoji build timeout sau ${BUILD_TIMEOUT_MS}ms (dict: ${dicPath})`));
        }
      }, BUILD_TIMEOUT_MS);
      // Không giữ process sống chỉ vì timer warmup
      if (typeof timer.unref === "function") timer.unref();
      kuromoji.builder({ dicPath }).build((err, tokenizer) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          reject(err);
          return;
        }
        if (!tokenizer) {
          reject(new Error("kuromoji builder returned empty tokenizer"));
          return;
        }
        tokenizerInstance = tokenizer as unknown as Tokenizer<IpadicFeatures>;
        resolve(tokenizerInstance);
      });
    } catch (e) {
      reject(e as Error);
    }
  });

  // Nếu build fail, cho phép retry ở lần gọi sau (không giữ rejected promise vĩnh viễn)
  tokenizerPromise.catch(() => {
    tokenizerPromise = null;
  });

  return tokenizerPromise;
}

function fallbackSplit(text: string): KuromojiToken[] {
  // Fallback khi dict chưa có hoặc kuromoji chưa cài — tách theo char
  // Giữ nguyên punctuation và whitespace như token riêng để không mất ký tự
  if (!text) return [];
  return Array.from(text).map((ch) => ({
    surface_form: ch,
    reading: ch,
    pos: ch.trim() === "" ? "空白" : "unknown",
    basic_form: ch,
    pos_detail: "",
    pos_sub: "",
  }));
}

/**
 * Tokenize Japanese text server-side.
 * - Lazy init kuromoji builder({dicPath: "node_modules/kuromoji/dict"})
 * - Promise cache tránh re-build dict khi gọi lại cùng server lifetime
 * - Fallback tách theo char nếu dict chưa có hoặc lỗi
 */
export async function tokenizeJapanese(text: string): Promise<KuromojiToken[]> {
  const input = typeof text === "string" ? text : String(text ?? "");
  if (!input || !input.trim()) return [];

  const trimmed = input.trim();

  try {
    const tokenizer = await buildTokenizer();
    const raw = tokenizer.tokenize(trimmed);
    if (!raw || raw.length === 0) {
      return fallbackSplit(trimmed);
    }
    return raw.map((t) => ({
      surface_form: t.surface_form,
      reading: (t.reading as string | undefined) ?? t.surface_form,
      pos: (t.pos as string | undefined) ?? "unknown",
      basic_form: (t.basic_form as string | undefined) ?? t.surface_form,
      pos_detail: ((t as unknown as Record<string, unknown>).pos_detail_1 as string | undefined) ?? "",
      pos_sub: ((t as unknown as Record<string, unknown>).pos_detail_2 as string | undefined) ?? "",
    }));
  } catch (err) {
    console.warn("[kuromoji] tokenizer failed, fallback to char split:", (err as Error)?.message);
    return fallbackSplit(trimmed);
  }
}

// Helpers cho test / debug — không dùng ở production
export function _clearTokenizerCacheForTest(): void {
  tokenizerPromise = null;
  tokenizerInstance = null;
}

export function _isTokenizerReady(): boolean {
  return tokenizerInstance !== null;
}

export function _getDictPathForDebug(): string {
  return getDictPath();
}
