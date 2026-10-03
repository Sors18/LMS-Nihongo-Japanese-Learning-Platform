/**
 * Pagination helpers — shared for home (12), admin (10), kanji (20)
 * Prisma skip/take friendly, URL ?page= aware
 */

/**
 * Parse page from searchParams. Clamps to >=1 and optionally to `total` upper bound.
 * @param searchParams - object containing `page`, URLSearchParams, or raw string/number
 * @param defaultPage - fallback when missing/invalid (default 1). If `total` is passed as third arg, clamp upper.
 * @param total - optional upper clamp (totalPages or total items? expects totalPages). When omitted, only clamp lower bound.
 */
export function parsePage(
  searchParams: unknown,
  defaultPage: number = 1,
  total?: number
): number {
  let raw: unknown

  if (searchParams == null) {
    raw = undefined
  } else if (searchParams instanceof URLSearchParams) {
    raw = searchParams.get("page")
  } else if (typeof searchParams === "string" || typeof searchParams === "number") {
    raw = searchParams
  } else if (Array.isArray(searchParams)) {
    raw = searchParams[0]
  } else if (typeof searchParams === "object") {
    const sp = searchParams as Record<string, unknown>
    if ("page" in sp) {
      raw = sp.page
    } else {
      raw = undefined
    }
  }

  if (Array.isArray(raw)) raw = raw[0]

  let parsed: number
  if (typeof raw === "number") {
    parsed = Math.floor(raw)
  } else if (typeof raw === "string") {
    // trim, handle empty
    const t = raw.trim()
    parsed = t === "" ? NaN : parseInt(t, 10)
  } else {
    parsed = NaN
  }

  const fallback = Math.floor(Number(defaultPage))
  const safeFallback = isNaN(fallback) || !isFinite(fallback) || fallback < 1 ? 1 : fallback

  if (isNaN(parsed) || !isFinite(parsed)) {
    // clamp fallback to total if provided
    if (typeof total === "number" && isFinite(total) && total >= 1) {
      return Math.min(safeFallback, Math.floor(total))
    }
    return safeFallback
  }

  let page = Math.floor(parsed)
  if (page < 1) page = 1
  if (typeof total === "number" && isFinite(total) && total >= 1) {
    const totalClamped = Math.max(1, Math.floor(total))
    if (page > totalClamped) page = totalClamped
  }
  return page
}

/**
 * Compute Prisma skip/take and totalPages, clamping page to 1..totalPages.
 */
export function getPagination({
  page,
  pageSize,
  total,
}: {
  page: number
  pageSize: number
  total: number
}): { skip: number; take: number; totalPages: number; page: number } {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize)) || 1)
  // totalPages: at least 0 when no items, otherwise ceil
  const totalPages = total <= 0 ? 0 : Math.ceil(total / safePageSize)

  // clamp page to 1 .. totalPages (or 1 when empty)
  const maxPage = totalPages === 0 ? 1 : totalPages
  let safePage = Math.floor(Number(page))
  if (isNaN(safePage) || !isFinite(safePage)) safePage = 1
  safePage = Math.max(1, Math.min(safePage, maxPage))

  const skip = (safePage - 1) * safePageSize
  return {
    skip,
    take: safePageSize,
    totalPages,
    page: safePage,
  }
}
