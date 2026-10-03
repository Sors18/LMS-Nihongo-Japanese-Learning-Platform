import { extractGrammarCore } from "@/app/actions/extractGrammar";
import { createExtractionStream } from "@/lib/extractStream";

export const dynamic = "force-dynamic";

function percentOf(stage: string, done: number, total: number): number {
  const frac = total > 0 ? Math.min(1, done / total) : 1;
  if (stage === "load") return 5;
  if (stage === "detect") return Math.round(5 + frac * 75);
  if (stage === "persist") return Math.round(80 + frac * 20);
  return 100;
}

function labelOf(stage: string, done: number, total: number): string {
  if (stage === "load") return "Đang tải phụ đề…";
  if (stage === "detect") return `Đang phát hiện ngữ pháp (${done}/${total} nhóm câu)`;
  if (stage === "persist") return `Đang lưu mẫu (${done}/${total})`;
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
  return createExtractionStream((report) => extractGrammarCore(videoId, report), percentOf, labelOf);
}
