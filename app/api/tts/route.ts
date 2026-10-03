import { NextResponse } from "next/server";
import { ensureTtsMp3 } from "@/lib/tts";

/** GET /api/tts?text=...&lang=ja — trả JSON { url } (mp3 cache trong public/tts). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const text = (u.searchParams.get("text") ?? "").trim();
  const lang = (u.searchParams.get("lang") ?? "ja").trim() || "ja";
  if (!text) return NextResponse.json({ error: "Thiếu text" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "Text quá dài (tối đa 500 ký tự)" }, { status: 400 });
  try {
    const { url, cached } = await ensureTtsMp3(text, lang);
    return NextResponse.json({ url, cached });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `TTS thất bại: ${msg}` }, { status: 502 });
  }
}
