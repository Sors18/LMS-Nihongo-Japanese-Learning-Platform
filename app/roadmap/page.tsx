import { getCurrentUser } from "@/lib/auth";
import { getRoadmapProgress } from "@/lib/roadmap";
import Roadmap from "@/components/Roadmap";


export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Lộ trình JLPT</h1>
        </div>
        <div className="rounded-2xl border border-sakura-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-700 font-medium">Vui lòng đăng nhập để xem lộ trình cá nhân.</p>
          <div className="mt-5 flex justify-center gap-3">
            <a href="/login" className="rounded-full bg-sakura-500 px-5 py-2 text-sm font-bold text-white hover:bg-sakura-600 shadow-sm">
              Đăng nhập
            </a>
            <a href="/" className="rounded-full border border-sakura-200 bg-white px-5 py-2 text-sm font-bold text-sakura-700 hover:bg-sakura-50">
              Về Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  let progress;
  try {
    progress = await getRoadmapProgress(user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Lộ trình JLPT</h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Không thể tải tiến độ: {msg.slice(0, 500)}
        </div>
      </div>
    );
  }

  const totalVocab = progress.reduce((s, p) => s + p.total, 0);
  const totalMastered = progress.reduce((s, p) => s + p.mastered, 0);
  const overallPct = totalVocab ? Math.round((totalMastered / totalVocab) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Lộ trình JLPT</h1>
          </div>
          <a href="/" className="rounded-full border border-sakura-200 bg-white px-4 py-1.5 text-xs font-bold text-sakura-700 hover:bg-sakura-50">
            ← Dashboard
          </a>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-sakura-200 bg-white p-3 text-center shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng từ vựng</div>
            <div className="mt-1 text-lg font-extrabold text-slate-800">{totalVocab}</div>
          </div>
          <div className="rounded-xl border border-sakura-200 bg-white p-3 text-center shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Đã thuộc</div>
            <div className="mt-1 text-lg font-extrabold text-emerald-600">{totalMastered}</div>
          </div>
          <div className="rounded-xl border border-sakura-200 bg-white p-3 text-center shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng tiến độ</div>
            <div className="mt-1 text-lg font-extrabold text-sakura-600">{overallPct}%</div>
          </div>
        </div>
      </div>

      <Roadmap progress={progress} />
    </div>
  );
}
