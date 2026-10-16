import type { Level } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import GrammarClient from "./GrammarClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý Ngữ pháp — LMS Nihongo" };

const VALID_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const PAGE_SIZE = 20;

type SearchParams = { q?: string | string[]; level?: string | string[]; page?: string | string[] };

export default async function AdminGrammarPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp: SearchParams = searchParams ? await searchParams : {};
  const rawQ = typeof sp.q === "string" ? sp.q : Array.isArray(sp.q) ? sp.q[0] : "";
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  const rawLevel = typeof sp.level === "string" ? sp.level : Array.isArray(sp.level) ? sp.level[0] : "";
  const levelParam = typeof rawLevel === "string" ? rawLevel.trim().toUpperCase() : "";
  const level = VALID_LEVELS.includes(levelParam as typeof VALID_LEVELS[number]) ? levelParam : "";
  const rawPage = typeof sp.page === "string" ? sp.page : Array.isArray(sp.page) ? sp.page[0] : undefined;
  const parsed = rawPage ? parseInt(rawPage, 10) : 1;
  const pageParam = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;

  let grammars: Array<{
    id: number;
    structure: string;
    explanation: string;
    level: string;
  }> = [];
  let total = 0;
  let totalPages = 1;
  let currentPage = pageParam;
  let error: string | null = null;

  try {
    // MySQL: bỏ `mode` (chỉ Postgres) — collation đã insensitive
    type GrammarWhere = {
      OR?: Array<{ structure: { contains: string } } | { explanation: { contains: string } }>;
      AND?: Array<{ OR: Array<{ structure: { contains: string } } | { explanation: { contains: string } }> }>;
      level?: Level;
    };
    const where: GrammarWhere = {};
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
      if (tokens.length) {
        where.AND = tokens.map((t) => ({
          OR: [{ structure: { contains: t } }, { explanation: { contains: t } }],
        }));
      }
    }
    if (level) {
      where.level = level as Level;
    }
    const whereClause = Object.keys(where).length ? (where as never) : undefined;

    total = await prisma.grammar.count({ where: whereClause });
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, pageParam), totalPages);
    const skip = (currentPage - 1) * PAGE_SIZE;

    grammars = await prisma.grammar.findMany({
      where: whereClause,
      orderBy: { id: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        structure: true,
        explanation: true,
        level: true,
      },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Serialize (grammar has no Date, but keep pattern consistent)
  const serialized = grammars.map((g) => ({
    id: g.id,
    structure: g.structure,
    explanation: g.explanation,
    level: g.level,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Quản lý Ngữ pháp</h1>
        <p className="mt-1 text-sm text-slate-500">
          Xem, thêm, sửa, xóa mẫu ngữ pháp. Tổng {total} mẫu
          {q ? ` • tìm kiếm: "${q}"` : ""}
          {level ? ` • level: ${level}` : ""} • Trang {currentPage}/{totalPages}. Chỉ ADMIN mới thao tác được (requireAdmin + revalidatePath).
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">
            {error}
          </pre>
          <p className="mt-2 text-sm text-slate-400">
            Kiểm tra XAMPP → Start MySQL, DB lms_nihongo, chạy <code>npm run db:push</code>
          </p>
        </div>
      ) : (
        <GrammarClient grammars={serialized} page={currentPage} totalPages={totalPages} initialQ={q} initialLevel={level} />
      )}

    </div>
  );
}
