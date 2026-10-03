import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Pagination from "@/components/Pagination";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = searchParams ? await searchParams : undefined;
  const rawPage = typeof sp?.page === "string" ? sp.page : Array.isArray(sp?.page) ? sp.page[0] : undefined;
  const pageParsed = Number.parseInt(rawPage || "1", 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

  const where = { user_id: user.id };

  const totalCount = await prisma.testResult.count({ where });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * PAGE_SIZE;

  const results = await prisma.testResult.findMany({
    where,
    include: { video: true },
    orderBy: { completed_at: "desc" },
    skip,
    take: PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Lịch sử làm bài</h1>
        <p className="mt-1 text-sm text-slate-400">
          Kết quả các bài kiểm tra của <span className="text-slate-200">{user.name}</span> — sắp xếp mới nhất trước. Trang {safePage}/{totalPages} • {totalCount} kết quả
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-2xl border border-sakura-200 bg-white p-8 shadow-sm text-center">
          <div className="text-2xl" aria-hidden="true">🌸</div>
          <p className="mt-2 text-sm font-medium text-slate-800">Chưa có lịch sử làm bài.</p>
          <p className="mt-1 text-xs text-slate-500">
            Xem video đến cuối và hoàn thành bài kiểm tra để lưu kết quả tại đây.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-sakura-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Video</th>
                    <th className="px-4 py-3 font-medium">Điểm</th>
                    <th className="px-4 py-3 font-medium">Ngày làm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {results.map((r) => {
                    const pct = r.total_questions > 0 ? Math.round((r.score / r.total_questions) * 100) : 0;
                    const isPerfect = r.score === r.total_questions && r.total_questions > 0;
                    const isGood = pct >= 50 && !isPerfect;
                    return (
                      <tr key={r.id} className="hover:bg-slate-700/40">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">
                            {r.video?.title ?? `Video #${r.video_id}`}
                          </p>
                          <p className="text-xs text-slate-400">
                            {r.video?.level ? `Cấp ${r.video.level}` : ""} {r.video?.youtube_id ? `• ${r.video.youtube_id}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                              isPerfect
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-600/30"
                                : isGood
                                  ? "bg-amber-500/15 text-amber-300 border border-amber-600/30"
                                  : "bg-slate-700 text-slate-200"
                            }`}
                          >
                            {r.score} / {r.total_questions}
                            <span className="text-[11px] opacity-70">({pct}%)</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <time dateTime={r.completed_at.toISOString()} title={r.completed_at.toISOString()}>
                            {new Intl.DateTimeFormat("vi-VN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(r.completed_at)}
                          </time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination currentPage={safePage} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
