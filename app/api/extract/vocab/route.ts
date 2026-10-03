import { extractVocabCore } from "@/app/actions/extractVocab";
import { createExtractionStream } from "@/lib/extractStream";

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
  let videoId = 0;
  try {
    const body = (await req.json()) as { videoId?: number };
    videoId = Number(body.videoId) || 0;
  } catch {
    // invalid body → core trả []
  }
  return createExtractionStream((report) => extractVocabCore(videoId, report), percentOf, labelOf);
}
