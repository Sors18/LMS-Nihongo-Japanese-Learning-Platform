import { insertSubtitleCore } from "@/app/actions/insertSubtitle";
import { createExtractionStream } from "@/lib/extractStream";

export const dynamic = "force-dynamic";

function percentOf(stage: string, done: number, total: number): number {
  const frac = total > 0 ? Math.min(1, done / total) : 1;
  if (stage === "parse") return 5;
  if (stage === "save") return 10;
  if (stage === "tokenize") return Math.round(10 + frac * 25);
  if (stage === "meanings") return Math.round(35 + frac * 25);
  if (stage === "detect") return Math.round(60 + frac * 25);
  if (stage === "persist") return Math.round(85 + frac * 15);
  return 100;
}

function labelOf(stage: string, done: number, total: number): string {
  if (stage === "parse") return "Đang phân tích phụ đề…";
  if (stage === "save") return "Đang lưu phụ đề…";
  if (stage === "tokenize") return `Đang tách từ (${done}/${total} dòng)`;
  if (stage === "meanings") return `Đang bổ sung từ vựng (${done}/${total} nhóm)`;
  if (stage === "detect") return `Đang phát hiện ngữ pháp (${done}/${total} nhóm)`;
  if (stage === "persist") return `Đang lưu mẫu (${done}/${total})`;
  return "Hoàn tất";
}

export async function POST(req: Request): Promise<Response> {
  let input: { videoId?: number; subtitleText?: string; mode?: "replace" | "append" } = {};
  try {
    input = (await req.json()) as typeof input;
  } catch {
    // invalid body → core trả lỗi
  }
  return createExtractionStream(
    (report) =>
      insertSubtitleCore(
        { videoId: Number(input.videoId) || 0, subtitleText: String(input.subtitleText ?? ""), mode: input.mode === "append" ? "append" : "replace" },
        report
      ),
    percentOf,
    labelOf
  );
}
