import { insertVideoCore } from "@/app/actions/insertVideo";
import { createExtractionStream } from "@/lib/extractStream";

export const dynamic = "force-dynamic";

function percentOf(stage: string, done: number, total: number): number {
  const frac = total > 0 ? Math.min(1, done / total) : 1;
  if (stage === "save") return 10;
  if (stage === "tokenize") return Math.round(10 + frac * 25);
  if (stage === "meanings") return Math.round(35 + frac * 25);
  if (stage === "detect") return Math.round(60 + frac * 25);
  if (stage === "persist") return Math.round(85 + frac * 15);
  return 100;
}

function labelOf(stage: string, done: number, total: number): string {
  if (stage === "save") return "Đang tạo video…";
  if (stage === "tokenize") return `Đang tách từ (${done}/${total} dòng)`;
  if (stage === "meanings") return `Đang bổ sung từ vựng (${done}/${total} nhóm)`;
  if (stage === "detect") return `Đang phát hiện ngữ pháp (${done}/${total} nhóm)`;
  if (stage === "persist") return `Đang lưu mẫu (${done}/${total})`;
  return "Hoàn tất";
}

type InsertVideoBody = {
  youtubeUrlOrId?: string;
  title?: string;
  level?: string;
  category?: string;
  series?: string;
  duration?: number;
  transcript?: string;
};

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const CATEGORIES = ["SHORT", "KAIWA", "SONG", "ANIME"] as const;

export async function POST(req: Request): Promise<Response> {
  let input: InsertVideoBody = {};
  try {
    input = (await req.json()) as InsertVideoBody;
  } catch {
    // invalid body → core trả lỗi
  }
  return createExtractionStream(
    (report) =>
      insertVideoCore(
        {
          youtubeUrlOrId: String(input.youtubeUrlOrId ?? ""),
          title: String(input.title ?? ""),
          level: (LEVELS as readonly string[]).includes(String(input.level)) ? (input.level as (typeof LEVELS)[number]) : "N5",
          category: (CATEGORIES as readonly string[]).includes(String(input.category)) ? (input.category as (typeof CATEGORIES)[number]) : "SHORT",
          series: String(input.series ?? ""),
          duration: Number(input.duration) || undefined,
          transcript: String(input.transcript ?? ""),
        },
        report
      ),
    percentOf,
    labelOf
  );
}
