"use client";

import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = ["SHORT", "KAIWA", "SONG", "ANIME"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  SHORT: "Video ngắn",
  KAIWA: "Video Kaiwa",
  SONG: "Bài hát",
  ANIME: "Anime",
};

export default function CategoryFilter() {
  // useRouter/useSearchParams return ReadonlyURLSearchParams — cast via unknown due to bundler resolution
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const searchParams = useSearchParams() as unknown as URLSearchParams;
  const active = searchParams.get("category");

  function setCategory(category: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!category) params.delete("category");
    else params.set("category", category);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setCategory(null)}
        className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
          !active ? "bg-sakura-500 text-white border-sakura-500 shadow-sm" : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
        }`}
      >
        Tất cả
      </button>
      {CATEGORIES.map((cat) => {
        const isActive = active === cat;
        return (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide transition-colors ${
              isActive
                ? "bg-sakura-600 border-sakura-600 text-white shadow-sm"
                : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
            }`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        );
      })}
      {/* Accessible select fallback for mobile screen readers */}
      <label className="sr-only" htmlFor="category-select">
        Lọc theo thể loại
      </label>
      <select
        id="category-select"
        value={active ?? ""}
        onChange={(e) => setCategory(e.target.value || null)}
        className="ml-2 rounded-lg border border-sakura-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sakura-300 md:hidden"
      >
        <option value="">Tất cả</option>
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {CATEGORY_LABEL[cat]}
          </option>
        ))}
      </select>
    </div>
  );
}
