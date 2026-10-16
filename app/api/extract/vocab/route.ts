import { extractVocabCore } from "@/app/actions/extractVocab";
import { createExtractionStream } from "@/lib/extractStream";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, rateKey, rateLimitedResponse, sweepRateBuckets, RATE_PRESETS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function percentOf(stage: string, done: number, total: number): number {
  const frac = total > 0 ? Math.min(1, done / total) : 1;
  if (stage === "tokenize") return Math.round(frac * 25);
  if (stage === "meanings") return Math.round(25 + frac * 65);
  return 100;
}

function labelOf(stage: string, done: number, total: number): string {
  if (stage === "tokenize") return `Đang tách từ (${done}/${total} dòng)`;
  if (stage === "meanings") return `Đang giải nghĩa (${done}/${total} nhóm từ)`;
  return "Hoàn tất";
}

export async function POST(req: Request): Promise<Response> {
  // Trích xuất tốn quota Gemini theo batch cả video → bắt buộc đăng nhập.
  const me = await getCurrentUser().catch(() => null);
  if (!me) return Response.json({ error: "Vui lòng đăng nhập để trích xuất từ vựng" }, { status: 401 });
  const rl = checkRateLimit(rateKey(req, "extract", me.id), RATE_PRESETS.extract.limit, RATE_PRESETS.extract.windowMs);
  sweepRateBuckets();
  if (!rl.allowed) return rateLimitedResponse(rl.resetMs);
  let videoId = 0;
  try {
    const body = (await req.json()) as { videoId?: number };
    videoId = Number(body.videoId) || 0;
  } catch {
    // invalid body → core trả []
  }
  if (!Number.isInteger(videoId) || videoId <= 0) {
    return Response.json({ error: "videoId không hợp lệ" }, { status: 400 });
  }
  return createExtractionStream((report) => extractVocabCore(videoId, report), percentOf, labelOf);
}
