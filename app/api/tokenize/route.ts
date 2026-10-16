import { NextResponse } from "next/server";
import { tokenizeAction } from "@/app/actions/tokenize";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, rateKey, rateLimitedResponse, sweepRateBuckets, RATE_PRESETS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_TEXT = 2000;

export async function POST(req: Request) {
  // Giữ public cho khách hover phụ đề, nhưng khách vãng lai bị giới hạn chặt hơn
  // (15/phút) so với user đăng nhập (60/phút) để khó abuse CPU Kuromoji.
  const me = await getCurrentUser().catch(() => null);
  const preset = me ? RATE_PRESETS.standard : RATE_PRESETS.anon;
  const rl = checkRateLimit(rateKey(req, "tokenize", me?.id), preset.limit, preset.windowMs);
  sweepRateBuckets();
  if (!rl.allowed) return rateLimitedResponse(rl.resetMs);
  try {
    const body = await req.json().catch(() => null);
    const text = body?.text as unknown;

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `Text quá dài (tối đa ${MAX_TEXT} ký tự)` }, { status: 400 });
    }

    const tokens = await tokenizeAction(text);
    return NextResponse.json({ tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { text: string } to tokenize. Uses server-only kuromoji with 3600s cache.",
  });
}
