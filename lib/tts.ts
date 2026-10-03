import "server-only";
import { createHash } from "crypto";
import { mkdir, writeFile, stat } from "fs/promises";
import path from "path";

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

export async function ensureTtsMp3(text: string, lang = "ja"): Promise<{ file: string; url: string; cached: boolean }> {
  const t = (text ?? "").trim();
  if (!t) throw new Error("TTS text rỗng");
  const key = ttsKey(t, lang);
  const file = path.join(DIR, `${key}.mp3`);
  if (await exists(file)) return { file, url: `/tts/${key}.mp3`, cached: true };
  await mkdir(DIR, { recursive: true });
  const buf = await fetchMp3(t, lang);
  if (buf.length < 500) throw new Error("TTS upstream trả file quá nhỏ");
  await writeFile(file, buf);
  return { file, url: `/tts/${key}.mp3`, cached: false };
}
