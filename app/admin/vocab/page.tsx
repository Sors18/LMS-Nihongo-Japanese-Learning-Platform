import { prisma } from "@/lib/prisma";
import VocabClient from "./VocabClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý Từ vựng — LMS Nihongo" };

const PAGE_SIZE = 20;

type SearchParams = { q?: string | string[]; level?: string | string[]; page?: string | string[] };

export default async function AdminVocabPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved: SearchParams = searchParams ? await searchParams : {};
  const rawQ = typeof resolved.q === "string" ? resolved.q : Array.isArray(resolved.q) ? resolved.q[0] : "";
  const q = (rawQ ?? "").trim();
  const rawLevel = typeof resolved.level === "string" ? resolved.level : Array.isArray(resolved.level) ? resolved.level[0] : "";
  const level = (rawLevel ?? "").trim();
  const rawPage = typeof resolved.page === "string" ? resolved.page : Array.isArray(resolved.page) ? resolved.page[0] : undefined;
  const parsed = rawPage ? parseInt(rawPage, 10) : 1;
  const pageParam = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;

  const validLevels = ["N5", "N4", "N3", "N2", "N1"];

  const where: Record<string, unknown> = {};
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length) {
      // MySQL: bỏ `mode` (chỉ Postgres hỗ trợ) — collation utf8mb4_*_ci đã insensitive
      (where as Record<string, unknown>).AND = tokens.map((t) => ({
        OR: [{ word: { contains: t } }, { reading: { contains: t } }, { meaning: { contains: t } }],
      }));
    }
  }
  if (level && validLevels.includes(level)) {
    (where as Record<string, unknown>).level = level;
  }

  let vocabularies: Array<{
    id: number;
    word: string;
    reading: string;
    meaning: string;
    level: string;
  }> = [];
  let total = 0;
  let totalPages = 1;
  let currentPage = pageParam;
  let error: string | null = null;

  try {
    const whereClause = Object.keys(where).length ? (where as never) : undefined;
    total = await prisma.vocabulary.count({ where: whereClause });
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, pageParam), totalPages);
    const skip = (currentPage - 1) * PAGE_SIZE;

    vocabularies = await prisma.vocabulary.findMany({
      where: whereClause,
      orderBy: { id: "desc" },
      skip,
      take: PAGE_SIZE,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quản lý Từ vựng</h1>
        <p className="mt-1 text-sm text-slate-400">
          Thêm, sửa, xóa từ vựng. Tìm kiếm theo từ/reading/nghĩa, lọc theo level. Tổng {total} từ
          {q ? ` · q="${q}"` : ""}
          {level ? ` · level=${level}` : ""} · Trang {currentPage}/{totalPages}.
          {" "}Chỉ ADMIN mới vào được (middleware đã chặn).
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{error}</pre>
          <p className="mt-2 text-sm text-slate-600">
            Kiểm tra XAMPP → Start MySQL, DB lms_nihongo, chạy <code>npm run db:push</code>
          </p>
        </div>
      ) : (
        <VocabClient vocabularies={vocabularies} page={currentPage} totalPages={totalPages} initialQ={q} initialLevel={level} />
      )}

    </div>
  );
}
