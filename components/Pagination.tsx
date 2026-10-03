"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

type PaginationProps = {
  page?: number;
  currentPage?: number;
  totalPages: number;
  baseUrl?: string;
  query?: Record<string, string | string[] | undefined | null> | URLSearchParams;
};

/**
 * Pagination — sakura style, reusable for home (12), admin (10), kanji (20)
 * Props spec: {page, totalPages, baseUrl, query?} + backward compat {currentPage, baseUrl?}
 * - active: bg-sakura-500 text-white
 * - inactive: bg-white border-sakura-200
 * - ellipsis for many pages, Prev/Next, onClick scroll:false
 */
export default function Pagination({ page, currentPage, totalPages, baseUrl, query }: PaginationProps) {
  // next/navigation hooks — cast via unknown to avoid bundler-type mismatch (see LevelFilter pattern)
  const pathname = (usePathname as unknown as () => string)();
  const searchParams = (useSearchParams as unknown as () => URLSearchParams)();
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };

  const current = page ?? currentPage ?? 1;
  const safeCurrent = Math.min(Math.max(1, Math.floor(current) || 1), Math.max(1, totalPages));
  const effectiveBase = baseUrl ?? pathname ?? "/";

  if (!totalPages || totalPages <= 1) return null;

  function buildHref(targetPage: number): string {
    const params = new URLSearchParams();

    if (query) {
      if (query instanceof URLSearchParams) {
        query.forEach((value, key) => {
          if (key === "page") return;
          if (value == null || value === "") return;
          params.set(key, value);
        });
      } else {
        for (const [key, value] of Object.entries(query)) {
          if (key === "page") continue;
          if (value == null || value === "") continue;
          if (Array.isArray(value)) {
            const v = value[0];
            if (v == null || v === "") continue;
            params.set(key, String(v));
          } else {
            params.set(key, String(value));
          }
        }
      }
    } else {
      // fallback: preserve current URL search params (level, category, q, etc.)
      // searchParams is ReadonlyURLSearchParams — cast to URLSearchParams
      const sp = searchParams as unknown as URLSearchParams;
      if (sp && typeof sp.forEach === "function") {
        sp.forEach((value, key) => {
          if (key === "page") return;
          params.set(key, value);
        });
      }
    }

    if (targetPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(targetPage));
    }

    const qs = params.toString();
    const cleanBase = (effectiveBase || "/").split("?")[0] || "/";
    return qs ? `${cleanBase}?${qs}` : cleanBase;
  }

  function handleClick(e: React.MouseEvent, targetPage: number) {
    // keep search/filter via query/baseUrl, scroll:false per spec
    e.preventDefault();
    if (targetPage < 1 || targetPage > totalPages) return;
    if (targetPage === safeCurrent) return;
    const href = buildHref(targetPage);
    router.push(href, { scroll: false });
  }

  // Build visible pages with ellipsis — show 1, total, and ±1 around current
  const pages: Array<number | string> = [];
  const all = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - safeCurrent) <= 1
  );
  for (let i = 0; i < all.length; i++) {
    if (i > 0 && (all[i] as number) - (all[i - 1] as number) > 1) pages.push("ellipsis");
    pages.push(all[i]);
  }

  const prevHref = buildHref(Math.max(1, safeCurrent - 1));
  const nextHref = buildHref(Math.min(totalPages, safeCurrent + 1));
  const isFirst = safeCurrent <= 1;
  const isLast = safeCurrent >= totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sakura-200 bg-white px-4 py-3 text-sm shadow-sm">
      <p className="text-xs text-slate-500">
        Trang {safeCurrent} / {totalPages}
      </p>
      <nav className="flex items-center gap-1.5" aria-label="Pagination">
        {/* Prev — bg-white border-sakura-200 inactive, disabled opacity */}
        <Link
          href={prevHref}
          scroll={false}
          onClick={(e) => handleClick(e, safeCurrent - 1)}
          aria-disabled={isFirst}
          tabIndex={isFirst ? -1 : undefined}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            isFirst
              ? "pointer-events-none border-sakura-100 bg-sakura-50 text-slate-400 opacity-50"
              : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700 shadow-sm"
          }`}
        >
          ‹ Trước
        </Link>

        {pages.map((p, idx) =>
          p === "ellipsis" ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 select-none" aria-hidden="true">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={buildHref(p as number)}
              scroll={false}
              onClick={(e) => handleClick(e, p as number)}
              aria-current={p === safeCurrent ? "page" : undefined}
              className={`flex h-7 min-w-[28px] items-center justify-center rounded-full border px-2.5 text-xs font-bold transition ${
                p === safeCurrent
                  ? "border-sakura-500 bg-sakura-500 text-white shadow-sm"
                  : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
              }`}
            >
              {p}
            </Link>
          )
        )}

        {/* Next */}
        <Link
          href={nextHref}
          scroll={false}
          onClick={(e) => handleClick(e, safeCurrent + 1)}
          aria-disabled={isLast}
          tabIndex={isLast ? -1 : undefined}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            isLast
              ? "pointer-events-none border-sakura-100 bg-sakura-50 text-slate-400 opacity-50"
              : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700 shadow-sm"
          }`}
        >
          Sau ›
        </Link>
      </nav>
    </div>
  );
}
