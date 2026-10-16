import "server-only";
import { createHash } from "crypto";
import { mkdir, writeFile, stat, readdir, unlink } from "fs/promises";
import path from "path";

// Giới hạn số file cache để public/tts không phình vô hạn (mỗi mp3 ~10-50KB).
const MAX_TTS_FILES = Number(process.env.TTS_MAX_FILES ?? 500) || 500;

/**
 * Server TTS — phát âm ja-JP ổn định, không phụ thuộc voice của máy chấm.
 * - Nguồn: Google Translate TTS (không cần key). Nếu có GOOGLE_TTS_* cấu hình sau này, thay fetchUrl.
 * - Cache file `public/tts/<sha1>.mp3` — request trùng trả ngay, không gọi lại mạng.
 * - Thất bại mạng → throw, caller fallback `speechSynthesis` ở client.
 */

const DIR = path.join(process.cwd(), "public", "tts");

export function ttsKey(text: string, lang = "ja"): string {
  const h = createHash("sha1").update(`${lang}:${text}`).digest("hex");
  return h;
}

export function ttsPublicUrl(text: string, lang = "ja"): string {
  return `/tts/${ttsKey(text, lang)}.mp3`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Tải mp3 từ Google Translate TTS (chunk ≤200 ký tự), ghép nhiều chunk nếu dài. */
async function fetchMp3(text: string, lang: string): Promise<Buffer> {
  const chunks: string[] = [];
  const clean = text.trim().slice(0, 500);
  for (let i = 0; i < clean.length; i += 180) chunks.push(clean.slice(i, i + 180));
  const parts: Buffer[] = [];
  for (const c of chunks) {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8" +
      `&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(c)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://translate.google.com/" },
    });
    if (!res.ok) throw new Error(`TTS upstream ${res.status}`);
    parts.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(parts);
}

/** Xóa file cũ nhất khi vượt quota — best-effort, không chặn request chính. */
async function pruneTtsCache(): Promise<void> {
  try {
    const files = await readdir(DIR).catch(() => [] as string[]);
    const mp3s = files.filter((f) => f.endsWith(".mp3"));
    if (mp3s.length <= MAX_TTS_FILES) return;
    const withTime = await Promise.all(
      mp3s.map(async (f) => {
        try {
          const s = await stat(path.join(DIR, f));
          return { f, mtime: s.mtimeMs };
        } catch {
          return { f, mtime: 0 };
        }
      })
    );
    withTime.sort((a, b) => a.mtime - b.mtime);
    const toDelete = withTime.slice(0, withTime.length - MAX_TTS_FILES);
    await Promise.all(toDelete.map(({ f }) => unlink(path.join(DIR, f)).catch(() => {})));
  } catch {
    // ignore — cache prune không được làm hỏng TTS
  }
}

export async function ensureTtsMp3(text: string, lang = "ja"): Promise<{ file: string; url: string; cached: boolean }> {
  const t = (text ?? "").trim();
  if (!t) throw new Error("TTS text rỗng");
  if (!/^(ja|vi|en)$/.test(lang)) throw new Error("TTS lang không hỗ trợ (ja|vi|en)");
  const key = ttsKey(t, lang);
  const file = path.join(DIR, `${key}.mp3`);
  if (await exists(file)) return { file, url: `/tts/${key}.mp3`, cached: true };
  await mkdir(DIR, { recursive: true });
  const buf = await fetchMp3(t, lang);
  if (buf.length < 500) throw new Error("TTS upstream trả file quá nhỏ");
  await writeFile(file, buf);
  // Dọn nền sau khi ghi xong
  void pruneTtsCache();
  return { file, url: `/tts/${key}.mp3`, cached: false };
}
