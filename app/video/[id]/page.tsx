import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Question, Subtitle, Video } from "@prisma/client";
import VideoDetailClient from "@/components/VideoDetailClient";
import { getCurrentUser } from "@/lib/auth";
type VideoDetail = Video & {
  subtitles: Subtitle[];
  questions: Question[];
};

const levelColor: Record<string, string> = {
  N5: "bg-emerald-600",
  N4: "bg-sky-600",
  N3: "bg-amber-500 text-slate-900",
  N2: "bg-orange-600",
  N1: "bg-red-600",
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  const currentUser = await getCurrentUser().catch(() => null);
  const isLoggedIn = !!currentUser;
  const isAdmin = currentUser?.role === "ADMIN";
  let video: VideoDetail | null = null;
  try {
    video = (await prisma.video.findUnique({
      where: { id: numericId },
      include: {
        subtitles: { orderBy: { start_time_ms: "asc" } },
        questions: true,
      },
    })) as VideoDetail | null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4">
        <a href="/" className="text-sm text-slate-400 hover:text-white">
          ← Dashboard
        </a>
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{msg}</pre>
          <p className="mt-3 text-sm text-slate-300">
            Kiểm tra XAMPP → Start MySQL, tạo DB lms_nihongo, chạy <code>npm run db:push && npm run db:seed</code>
          </p>
        </div>
      </div>
    );
  }

  if (!video) notFound();

  const v = video as VideoDetail;

  return (
    <div className="space-y-6">
      <a href="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← Quay lại Dashboard
      </a>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold leading-tight md:text-2xl">{v.title}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide text-white ${levelColor[v.level] ?? "bg-slate-600"}`}>
          {v.level}
        </span>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-mono text-slate-300">{formatDuration(v.duration)}</span>
        <span className="text-xs text-slate-400">
          {v.subtitles.length} phụ đề · {v.questions.length} câu hỏi
        </span>
      </div>

      <VideoDetailClient
        videoId={v.id}
        youtubeId={v.youtube_id}
        title={v.title}
        level={v.level}
        duration={v.duration}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        subtitles={v.subtitles.map((s) => ({ id: s.id, start_time_ms: s.start_time_ms, end_time_ms: s.end_time_ms, raw_text: s.raw_text, translation: s.translation ?? null }))}
        questions={v.questions.map((q) => ({
          id: q.id,
          question_type: q.question_type,
          content: q.content,
          options: q.options,
          correct_answer: q.correct_answer,
        }))}
      />
    </div>
  );
}
