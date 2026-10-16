import { prisma } from "@/lib/prisma";
import QuestionsAdminClient from "./QuestionsAdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Câu hỏi theo video — LMS Nihongo" };

type SearchParams = { videoId?: string | string[] };

function parseVideoId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

export default async function AdminQuestionsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const sp = searchParams ? await searchParams : undefined;
  const videoId = parseVideoId(sp?.videoId);

  // Không chọn video → liệt kê video đã có câu hỏi để admin picking
  if (!videoId) {
    let videos: Array<{ id: number; title: string; level: string; questionCount: number }> = [];
    let error: string | null = null;
    try {
      const rows = await prisma.video.findMany({
        where: { questions: { some: {} } },
        select: { id: true, title: true, level: true, _count: { select: { questions: true } } },
        orderBy: { id: "desc" },
        take: 30,
      });
      videos = rows.map((r) => ({ id: r.id, title: r.title, level: String(r.level), questionCount: r._count.questions }));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Câu hỏi theo video</h1>
          <p className="mt-1 text-sm text-slate-400">Chọn video để xem toàn bộ câu hỏi kèm đáp án, sửa hoặc xóa từng câu.</p>
        </div>
        {error ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
            <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
            <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{error}</pre>
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-xl border border-sakura-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">Chưa có video nào có câu hỏi. Mở 1 video rồi bấm “Tạo câu hỏi”.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-sakura-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-sakura-50 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">Video</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Số câu</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 bg-white">
                {videos.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-700/40">
                    <td className="px-3 py-2 font-medium text-sakura-900">
                      #{v.id} · <span className="max-w-[320px] truncate inline-block align-bottom">{v.title}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold text-sakura-700">{v.level}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-sakura-700">{v.questionCount}</td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/admin/questions?videoId=${v.id}`} className="rounded-full bg-sky-500 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-600 shadow-sm">
                        Xem / sửa
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Có videoId → load video + toàn bộ câu hỏi (kèm đáp án cho admin)
  let video: { id: number; title: string; level: string; youtube_id: string } | null = null;
  let questions: Array<{ id: number; question_type: string; content: string; options: string[]; correct_answer: string }> = [];
  let error: string | null = null;
  try {
    const v = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, title: true, level: true, youtube_id: true, questions: { orderBy: { id: "asc" } } },
    });
    if (!v) {
      return (
        <div className="space-y-4">
          <a href="/admin/questions" className="text-sm text-slate-400 hover:text-white">← Tất cả video có câu hỏi</a>
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">Không tìm thấy video #{videoId}.</p>
        </div>
      );
    }
    video = { id: v.id, title: v.title, level: String(v.level), youtube_id: v.youtube_id };
    questions = v.questions.map((q) => ({
      id: q.id,
      question_type: String(q.question_type),
      content: q.content,
      options: toStringArray(q.options),
      correct_answer: q.correct_answer,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <div className="space-y-4">
        <a href="/admin/questions" className="text-sm text-slate-400 hover:text-white">← Tất cả video có câu hỏi</a>
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{error}</pre>
        </div>
      </div>
    );
  }

  return <QuestionsAdminClient video={video!} questions={questions} />;
}
