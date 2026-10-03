import { prisma } from "@/lib/prisma";
import VideosAdminClient from "./VideosAdminClient";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý Video — LMS Nihongo" };

type AdminVideosSearchParams = { q?: string | string[]; page?: string | string[] };

const PAGE_SIZE = 10;

export default async function AdminVideosPage({
  searchParams,
}: {
  searchParams?: Promise<AdminVideosSearchParams>;
}) {

  // Parse q for fuzzy search (contains insensitive + tách từ) — mirror dashboard filter đã sửa
  const sp = searchParams ? await searchParams : undefined;
  const rawQ = typeof sp?.q === "string" ? sp.q : Array.isArray(sp?.q) ? sp.q[0] : undefined;
  const q = rawQ?.trim() ? rawQ.trim() : undefined;

  const rawPage = typeof sp?.page === "string" ? sp.page : Array.isArray(sp?.page) ? sp.page[0] : undefined;
  const parsedPage = rawPage ? parseInt(rawPage, 10) : 1;
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  let videos: Array<{
    id: number;
    youtube_id: string;
    title: string;
    level: string;
    category: string;
    series: string | null;
    duration: number;
    _count: { subtitles: number; questions: number; grammar_points: number };
  }> = [];
  let error: string | null = null;
  let total = 0;
  let totalPages = 1;
  let currentPage = requestedPage;

  try {
    const where: Prisma.VideoWhereInput = {};
    if (q) {
      // Tách từ + contains mode insensitive (MySQL collation đã insensitive; dùng contains cho từng từ với AND)
      const terms = q.split(/\s+/).filter(Boolean);
      if (terms.length === 1) {
        const t = terms[0]!;
        where.OR = [
          { title: { contains: t, mode: "insensitive" } as unknown as Prisma.StringFilter },
          { youtube_id: { contains: t, mode: "insensitive" } as unknown as Prisma.StringFilter },
        ];
      } else if (terms.length > 1) {
        where.AND = terms.map((t) => ({
          OR: [
            { title: { contains: t, mode: "insensitive" } as unknown as Prisma.StringFilter },
            { youtube_id: { contains: t, mode: "insensitive" } as unknown as Prisma.StringFilter },
          ],
        }));
      }
    }

    total = await prisma.video.count({ where });
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, requestedPage), totalPages);
    const skip = (currentPage - 1) * PAGE_SIZE;

    videos = await prisma.video.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        youtube_id: true,
        title: true,
        level: true,
        category: true,
        series: true,
        duration: true,
        _count: { select: { subtitles: true, questions: true, grammar_points: true } },
      },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quản lý Video đã chèn</h1>
        <p className="mt-1 text-sm text-slate-400">Xem danh sách, sửa thông tin, xóa, hoặc nhảy tới chèn phụ đề. Tổng {total || videos.length} video.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{error}</pre>
          <p className="mt-2 text-sm text-slate-600">Kiểm tra XAMPP → Start MySQL, DB lms_nihongo, chạy <code>npm run db:push</code></p>
        </div>
      ) : (
        <VideosAdminClient videos={videos} query={q ?? ""} total={total} totalPages={totalPages} currentPage={currentPage} />
      )}

    </div>
  );
}
