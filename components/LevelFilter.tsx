"use client";

import { useRouter, useSearchParams } from "next/navigation";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

export default function LevelFilter() {
  // useRouter/useSearchParams return ReadonlyURLSearchParams — cast via unknown due to bundler resolution
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const searchParams = useSearchParams() as unknown as URLSearchParams;
  const active = searchParams.get("level");

  function setLevel(level: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!level) params.delete("level");
    else params.set("level", level);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setLevel(null)}
        className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
          !active ? "bg-sakura-500 text-white border-sakura-500 shadow-sm" : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
        }`}
      >
        Tất cả
      </button>
      {LEVELS.map((lv) => {
        const isActive = active === lv;
        return (
          <button
            key={lv}
            onClick={() => setLevel(lv)}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide transition-colors ${
              isActive
                ? "bg-sakura-600 border-sakura-600 text-white shadow-sm"
                : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
            }`}
          >
            {lv}
          </button>
        );
      })}
      {/* Accessible select fallback for mobile screen readers */}
      <label className="sr-only" htmlFor="level-select">
        Lọc theo level
      </label>
      <select
        id="level-select"
        value={active ?? ""}
        onChange={(e) => setLevel(e.target.value || null)}
        className="ml-2 rounded-lg border border-sakura-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sakura-300 md:hidden"
      >
        <option value="">Tất cả</option>
        {LEVELS.map((lv) => (
          <option key={lv} value={lv}>
            {lv}
          </option>
        ))}
      </select>
    </div>
  );
}
