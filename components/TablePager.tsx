"use client";

/**
 * TablePager — phân trang state nội bộ cho bảng dài (từ vựng/ngữ pháp trích xuất).
 * Khác Pagination (đẩy ?page= lên URL cho server pages): component này controlled
 * qua {page, onPage}, không chạm router — tránh xung đột với ?page= của dashboard.
 */

/** Tổng số trang cho total items với pageSize. */
export function getPageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / Math.floor(pageSize)));
}

/** Kẹp page về [1, totalPages]. */
export function clampPage(page: number, totalPages: number): number {
  const t = Math.max(1, Math.floor(totalPages) || 1);
  const p = Math.floor(page) || 1;
  return Math.min(Math.max(1, p), t);
}

/** Cắt list theo trang (page bắt đầu từ 1). */
export function paginateList<T>(list: T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const totalPages = getPageCount(list.length, size);
  const p = clampPage(page, totalPages);
  return list.slice((p - 1) * size, p * size);
}

export default function TablePager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const safeTotal = Math.max(1, Math.floor(totalPages) || 1);
  const safeCurrent = clampPage(page, safeTotal);
  if (safeTotal <= 1) return null;

  const all = Array.from({ length: safeTotal }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === safeTotal || Math.abs(p - safeCurrent) <= 1
  );
  const items: Array<number | "…"> = [];
  for (let i = 0; i < all.length; i++) {
    if (i > 0 && all[i] - all[i - 1] > 1) items.push("…");
    items.push(all[i]);
  }

  const btn =
    "rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const idle = "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700 shadow-sm";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-500">
        Trang {safeCurrent} / {safeTotal}
      </p>
      <nav className="flex items-center gap-1.5" aria-label="Phân trang bảng">
        <button
          onClick={() => onPage(safeCurrent - 1)}
          disabled={safeCurrent <= 1}
          className={`${btn} ${idle}`}
        >
          ‹ Trước
        </button>
        {items.map((p, idx) =>
          p === "…" ? (
            <span key={`e-${idx}`} className="px-1 text-slate-400 select-none" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-current={p === safeCurrent ? "page" : undefined}
              className={`flex h-7 min-w-[28px] items-center justify-center rounded-full border px-2.5 text-xs font-bold transition ${
                p === safeCurrent
                  ? "border-sakura-500 bg-sakura-500 text-white shadow-sm"
                  : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(safeCurrent + 1)}
          disabled={safeCurrent >= safeTotal}
          className={`${btn} ${idle}`}
        >
          Sau ›
        </button>
      </nav>
    </div>
  );
}
