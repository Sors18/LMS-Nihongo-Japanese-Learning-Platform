import { getCurrentUser } from "@/lib/auth";
import { getStreakDataForUser } from "@/lib/streak";
import StreakFire from "@/components/StreakFire";

export const dynamic = "force-dynamic";

export default async function StreakPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-xl border border-sakura-200 bg-white p-8 text-center shadow-sm">
          <p className="text-2xl">🔥</p>
          <h1 className="mt-2 text-xl font-bold text-slate-800">Streak lửa</h1>
          <p className="mt-2 text-sm text-slate-500">Bạn cần đăng nhập để xem streak và heatmap.</p>
          <a
            href="/login"
            className="mt-4 inline-block rounded-full bg-sakura-500 px-5 py-2 text-sm font-bold text-white hover:bg-sakura-600 shadow-sm"
          >
            Đăng nhập
          </a>
        </div>
      </div>
    );
  }

  // Lấy 90 ngày heatmap + streak + XP
  const data = await getStreakDataForUser(user.id, 90);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Streak & Heatmap</h1>
      </div>

      <StreakFire initialData={data} />

      {/* Chi tiết bổ sung */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Streak hiện tại</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-sakura-600">🔥 {data.streak}</span>
            <span className="text-sm text-slate-500">ngày</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {data.streak === 0 ? "Bắt đầu hôm nay!" : "Giữ lửa mỗi ngày nhé!"}
          </p>
        </div>
        <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tổng XP</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-800">{data.totalXp}</p>
          <p className="mt-1 text-xs text-slate-400">{data.totalCount} hoạt động đã ghi nhận</p>
        </div>
        <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hôm nay</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-800">{data.todayCount}</p>
          <p className="mt-1 text-xs text-slate-400">{data.todayXp} XP hôm nay</p>
        </div>
      </div>
    </div>
  );
}
