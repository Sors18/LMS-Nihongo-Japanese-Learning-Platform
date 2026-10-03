"use client";

import { useEffect, useState } from "react";
import { getStreakData } from "@/app/actions/streak";
import type { StreakData, HeatmapEntry } from "@/lib/streak";

type Props = {
  initialData?: StreakData | null;
  compact?: boolean;
  days?: number;
};

function colorForCount(count: number): string {
  if (count === 0) return "bg-slate-100 border border-slate-200";
  if (count <= 2) return "bg-sakura-100 border border-sakura-200";
  if (count <= 5) return "bg-sakura-200 border border-sakura-300";
  if (count <= 9) return "bg-sakura-300 border border-sakura-400";
  return "bg-sakura-500 border border-sakura-600";
}

function formatTooltip(e: HeatmapEntry): string {
  if (e.count === 0) return `${e.date}: chưa học`;
  return `${e.date}: ${e.count} hoạt động · ${e.xp} XP`;
}

// Sắp xếp heatmap thành 7 hàng x 13 cột (GitHub style)
// heatmap đã sort tăng dần theo ngày; cần nhóm theo tuần
function chunkWeeks(heatmap: HeatmapEntry[], cols = 13): HeatmapEntry[][] {
  // Lấy `cols*7` ngày cuối (91 ngày cho 13 tuần)
  const total = cols * 7;
  const slice = heatmap.slice(-total);
  // Nếu heatmap ngắn hơn (ví dụ days=90) thì pad đầu bằng empty để đủ 91
  const weeks: HeatmapEntry[][] = [];
  for (let i = 0; i < slice.length; i += 7) {
    weeks.push(slice.slice(i, i + 7));
  }
  // Đảm bảo đủ cols cột — pad cột rỗng phía trước nếu cần (trường hợp lệch)
  while (weeks.length < cols) {
    weeks.unshift(
      Array.from({ length: 7 }, () => ({ date: "", count: -1, xp: 0 }))
    );
  }
  // Mỗi tuần phải đủ 7 ngày (trường hợp tuần đầu lẻ)
  for (const w of weeks) {
    while (w.length < 7) w.unshift({ date: "", count: -1, xp: 0 });
  }
  return weeks;
}

export default function StreakFire({ initialData, compact = false, days = 90 }: Props) {
  const [data, setData] = useState<StreakData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let alive = true;
    setLoading(true);
    getStreakData(days)
      .then((res) => {
        if (!alive) return;
        // res có thêm authenticated, nhưng vẫn là StreakData
        const { authenticated: _a, ...rest } = res as StreakData & { authenticated: boolean };
        // nếu chưa đăng nhập thì vẫn set nhưng streak 0
        setData(rest as StreakData);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [initialData, days]);

  if (loading) {
    return (
      <div
        className={`rounded-xl border border-sakura-200 bg-white p-4 shadow-sm ${compact ? "py-3" : ""}`}
        aria-busy="true"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-sakura-100" />
          <div className="grid grid-cols-13 gap-1">
            {Array.from({ length: 91 }).map((_, i) => (
              <div key={i} className="h-3 w-3 rounded-sm bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Không tải được streak: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-sakura-200 bg-white p-4 text-sm text-slate-600">
        Chưa có dữ liệu streak. <a href="/login" className="text-sakura-600 underline">Đăng nhập</a> để bắt đầu.
      </div>
    );
  }

  const streak = data.streak ?? 0;
  const totalXp = data.totalXp ?? 0;
  const totalCount = data.totalCount ?? 0;
  const heatmap = data.heatmap ?? [];

  // Compact header mode: chỉ hiện lửa + XP, không grid dài
  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-sakura-200 bg-white px-3 py-1.5 shadow-sm">
        <span className="inline-flex items-center gap-1 text-sm font-bold">
          <span className="text-base" aria-hidden>
            🔥
          </span>
          <span className={streak > 0 ? "text-sakura-600" : "text-slate-400"}>{streak}</span>
          <span className="text-xs font-normal text-slate-500">ngày</span>
        </span>
        <span className="h-4 w-px bg-sakura-100" aria-hidden />
        <span className="text-xs font-medium text-slate-600">
          <span className="font-bold text-sakura-600">{totalXp}</span> XP
        </span>
        {totalCount > 0 && (
          <>
            <span className="h-4 w-px bg-sakura-100 hidden sm:inline" aria-hidden />
            <span className="hidden sm:inline text-xs text-slate-500">{totalCount} hoạt động</span>
          </>
        )}
      </div>
    );
  }

  const weeks = chunkWeeks(heatmap, 13);

  // Tính maxCount để legend? Dùng cố định theo ngưỡng màu
  const flame = streak === 0 ? "🔥" : streak >= 7 ? "🔥🔥" : streak >= 3 ? "🔥✨" : "🔥";

  return (
    <div className="rounded-xl border border-sakura-200 bg-white p-4 sm:p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sakura-100 to-sakura-200 border border-sakura-200 text-lg shadow-sm">
            {flame}
          </span>
          <div>
            <p className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-slate-800">{streak}</span>
              <span className="text-sm font-medium text-slate-500">ngày streak</span>
            </p>
            <p className="text-xs text-slate-400">
              {streak === 0
                ? "Xem hết 1 video, làm flashcard hoặc test hôm nay để bắt đầu streak!"
                : streak === 1
                  ? "Tuyệt! Duy trì mỗi ngày để giữ lửa."
                  : `Đang cháy ${streak} ngày liên tiếp — cố lên!`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sakura-50 border border-sakura-200 px-3 py-1.5 text-xs font-bold text-sakura-700">
            <span className="h-2 w-2 rounded-full bg-sakura-500 animate-pulse" aria-hidden />
            {totalXp} XP
          </span>
          <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
            {totalCount} hoạt động
          </span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Heatmap {heatmap.length} ngày gần nhất
          </p>
          <a href="/streak" className="text-xs font-medium text-sakura-600 hover:text-sakura-700">
            Xem chi tiết →
          </a>
        </div>

        <div className="mt-3 overflow-x-auto pb-1">
          <div className="flex gap-1 min-w-max">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day, di) => {
                  if (day.count === -1) {
                    return <div key={`${wi}-${di}`} className="h-3 w-3 sm:h-[13px] sm:w-[13px]" aria-hidden />;
                  }
                  return (
                    <div
                      key={day.date || `${wi}-${di}`}
                      title={formatTooltip(day)}
                      aria-label={formatTooltip(day)}
                      className={`h-3 w-3 sm:h-[13px] sm:w-[13px] rounded-sm ${colorForCount(day.count)} transition hover:ring-1 hover:ring-sakura-400 hover:ring-offset-1 cursor-pointer`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span>Ít</span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-slate-100 border border-slate-200" />
            <span className="h-3 w-3 rounded-sm bg-sakura-100 border border-sakura-200" />
            <span className="h-3 w-3 rounded-sm bg-sakura-200 border border-sakura-300" />
            <span className="h-3 w-3 rounded-sm bg-sakura-300 border border-sakura-400" />
            <span className="h-3 w-3 rounded-sm bg-sakura-500 border border-sakura-600" />
          </span>
          <span>Nhiều</span>
        </div>
      </div>
    </div>
  );
}
