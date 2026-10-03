"use client";

import type { RoadmapLevelProgress } from "@/lib/roadmap";


type Props = {
  progress: RoadmapLevelProgress[];
};

export default function Roadmap({ progress }: Props) {
  return (
    <div className="relative mx-auto max-w-3xl">
      {/* vertical sakura line */}
      <div className="absolute left-6 top-4 bottom-4 w-1 -translate-x-1/2 rounded-full bg-sakura-200 md:left-1/2" aria-hidden />

      <div className="space-y-8">
        {progress.map((item, idx) => {
          const isCompleted = item.total > 0 && item.mastered >= item.total;
          const isActive = item.percent > 0 && item.percent < 100;
          // Node colors per spec
          let nodeClasses = "";
          if (isCompleted) {
            nodeClasses = "bg-emerald-500 border-emerald-500 text-white shadow-md";
          } else if (isActive) {
            nodeClasses = "bg-sakura-500 border-sakura-500 text-white shadow-md";
          } else {
            nodeClasses = "bg-white border-sakura-200 text-slate-400";
          }

          // progress bar fill color
          const barFill = isCompleted ? "bg-emerald-500" : "bg-sakura-500";
          const barTrack = isCompleted ? "bg-emerald-100" : "bg-sakura-100";

          // alternate sides on md for visual roadmap feel, but keep readable
          const isReverse = idx % 2 === 1;

          return (
            <div
              key={item.level}
              className={`relative flex items-stretch gap-4 md:gap-6 ${isReverse ? "md:flex-row-reverse" : ""}`}
            >
              {/* Node column */}
              <div className="relative flex flex-col items-center">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold tracking-wide ${nodeClasses}`}
                  aria-label={`Level ${item.level} ${isCompleted ? "hoàn thành" : isActive ? "đang học" : "chưa bắt đầu"}`}
                >
                  {item.level}
                </div>
                {/* connector dot subtle */}
                {isCompleted && <span className="mt-1 text-[10px]">✓</span>}
              </div>

              {/* Card */}
              <div className="flex-1">
                <div
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                    isCompleted ? "border-emerald-200" : isActive ? "border-sakura-200" : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold tracking-widest ${
                          isCompleted
                            ? "bg-emerald-500 text-white"
                            : isActive
                              ? "bg-sakura-500 text-white"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {item.level}
                      </span>
                      <span className="text-sm font-bold text-slate-700">{item.percent}%</span>
                      {isCompleted && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          Hoàn thành
                        </span>
                      )}
                      {isActive && (
                        <span className="rounded-full bg-sakura-50 px-2 py-0.5 text-[11px] font-bold text-sakura-700 border border-sakura-200">
                          Đang học
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {item.avgScore !== null ? (
                        <>
                          Điểm TB: <span className="font-semibold text-slate-700">{item.avgScore}%</span>{" "}
                          <span className="text-slate-400">({item.testCount} bài)</span>
                        </>
                      ) : (
                        <span className="text-slate-400">Chưa có bài test</span>
                      )}
                    </span>
                  </div>

                  {/* progress bar */}
                  <div className="mt-3">
                    <div className={`h-3 w-full overflow-hidden rounded-full ${barTrack}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barFill}`}
                        style={{ width: `${item.percent}%` }}
                        role="progressbar"
                        aria-valuenow={item.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Tiến độ ${item.level}: ${item.percent}%`}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        <span className="font-bold text-slate-800">{item.mastered}</span>
                        <span className="text-slate-500"> / {item.total} từ đã thuộc</span>
                      </span>
                      <span className="font-medium text-slate-500">{item.percent}% hoàn thành</span>
                    </div>
                  </div>

                  {/* action */}
                  <div className="mt-4 flex items-center gap-3">
                    <a
                      href={`/?level=${item.level}`}
                      className={`inline-flex items-center rounded-full px-5 py-2 text-sm font-bold shadow-sm transition ${
                        isCompleted
                          ? "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          : "bg-sakura-500 text-white hover:bg-sakura-600"
                      }`}
                    >
                      Học tiếp
                      <span aria-hidden className="ml-1">
                        →
                      </span>
                    </a>
                    {isCompleted ? (
                      <span className="text-xs text-emerald-600 font-medium">Tuyệt vời! Đã thuộc hết từ {item.level}</span>
                    ) : item.mastered === 0 && item.total > 0 ? (
                      <span className="text-xs text-slate-500">Bắt đầu với {item.total} từ vựng {item.level}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* spacer for alternating layout on desktop */}
              <div className="hidden flex-1 md:block" aria-hidden />
            </div>
          );
        })}
      </div>

      {/* footer legend */}
      <div className="mt-10 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-white border border-sakura-200" /> Chưa học
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-sakura-500" /> Đang học
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-emerald-500" /> Hoàn thành
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-6 w-1 rounded-full bg-sakura-200 inline-block" /> Lộ trình
        </span>
      </div>
    </div>
  );
}
