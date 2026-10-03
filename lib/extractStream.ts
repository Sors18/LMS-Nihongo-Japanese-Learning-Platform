import "server-only";
import type { StageProgressFn } from "./gemini";

// ---------------------------------------------------------------------------
// SSE cho job trích xuất dài (vocab / grammar).
// Route truyền run() thực thi pipeline + percentOf() ánh xạ stage → %.
// Client đọc event "data:" để vẽ popup tiến trình, event cuối mang payload.
// ---------------------------------------------------------------------------

export function createExtractionStream(
  run: (report: StageProgressFn) => Promise<unknown>,
  percentOf: (stage: string, done: number, total: number) => number,
  labelOf: (stage: string, done: number, total: number) => string
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        const payload = await run((stage, done, total) => {
          send({ stage: labelOf(stage, done, total), done, total, percent: percentOf(stage, done, total) });
        });
        send({ ok: true as const, payload });
      } catch (e) {
        send({ ok: false as const, error: e instanceof Error ? e.message : "Trích xuất thất bại" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
