import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TestClient from "./TestClient";

export const dynamic = "force-dynamic";

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) notFound();

  let video: { title: string; youtube_id: string } | null = null;
  let questions: Array<{ id: number; question_type: string; content: string; options: unknown; correct_answer: string }> = [];
  let subtitles: Array<{ id: number; raw_text: string; start_time_ms: number; end_time_ms: number }> = [];
  let error: string | null = null;

  try {
    const v = await prisma.video.findUnique({
      where: { id: videoId },
      select: { title: true, youtube_id: true, subtitles: { select: { id: true, raw_text: true, start_time_ms: true, end_time_ms: true }, orderBy: { start_time_ms: "asc" } } },
    });
    if (!v) notFound();
    video = { title: v.title, youtube_id: v.youtube_id };
    subtitles = v.subtitles;
    const qs = await prisma.question.findMany({ where: { video_id: videoId }, orderBy: { id: "asc" } });
    questions = qs.map((q) => ({ id: q.id, question_type: q.question_type, content: q.content, options: q.options, correct_answer: q.correct_answer }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <div className="space-y-4">
        <a href={`/video/${videoId}`} className="text-sm text-slate-400 hover:text-white">
          ← Quay lại Video
        </a>
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <TestClient
      videoId={videoId}
      questions={questions}
      title={video?.title ?? `Video #${videoId}`}
      youtubeId={video?.youtube_id}
      subtitles={subtitles}
    />
  );
}
