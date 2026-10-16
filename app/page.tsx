import { prisma } from "@/lib/prisma";
import VideoCard from "@/components/VideoCard";
import LevelFilter from "@/components/LevelFilter";
import CategoryFilter from "@/components/CategoryFilter";
import SearchInput from "@/components/SearchInput";
import StreakFire from "@/components/StreakFire";
import Pagination from "@/components/Pagination";
import { getCurrentUser } from "@/lib/auth";
import { getStreakDataForUser } from "@/lib/streak";
import type { StreakData } from "@/lib/streak";
import { Prisma } from "@prisma/client";
const VALID_LEVELS: Record<string, true> = { N5: true, N4: true, N3: true, N2: true, N1: true };
const VALID_CATEGORIES: Record<string, true> = { SHORT: true, KAIWA: true, SONG: true, ANIME: true };
const CATEGORY_LABEL: Record<string, string> = {
  SHORT: "Video ngắn",
  KAIWA: "Video Kaiwa",
  SONG: "Bài hát",
  ANIME: "Anime",
};

type SearchParams = { level?: string | string[]; category?: string | string[]; q?: string | string[]; page?: string | string[] };

const PAGE_SIZE = 12;

function parsePage(raw: string | string[] | undefined): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return 1;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function DbFallback({ errorMessage }: { errorMessage: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard — LMS Nihongo</h1>
        <p className="mt-1 text-sm text-slate-600">Học tiếng Nhật qua video YouTube</p>
      </div>

      <div className="rounded-xl border border-sakura-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-700">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          Không kết nối được MySQL — kiểm tra XAMPP
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Prisma không thể kết nối tới cơ sở dữ liệu. Đây là fallback khi MySQL chưa chạy (chưa start XAMPP).
        </p>
        <pre className="mt-3 overflow-auto rounded-lg border border-sakura-200 bg-sakura-50 p-3 text-xs text-slate-700">{errorMessage}</pre>

        <div className="mt-6 space-y-3 text-sm leading-relaxed text-slate-700">
          <h3 className="font-semibold text-slate-800">Cách khắc phục (XAMPP trên Windows):</h3>
          <ol className="list-decimal space-y-1 pl-5 text-slate-600">
            <li>
              Mở <span className="font-mono text-slate-800">XAMPP Control Panel</span> → bấm{" "}
              <span className="font-semibold text-emerald-600">Start</span> ở dòng <span className="font-mono">MySQL</span> (và Apache nếu cần). Đợi trạng thái chuyển xanh.
            </li>
            <li>
              Mở <span className="font-mono">http://localhost/phpmyadmin</span> → tạo database{" "}
              <span className="font-mono text-slate-800">lms_nihongo</span> nếu chưa có (Collation utf8mb4_general_ci).
            </li>
            <li>
              Kiểm tra <span className="font-mono">.env</span>:{" "}
              <span className="font-mono text-xs bg-sakura-50 border border-sakura-200 px-1.5 py-0.5 rounded text-slate-700">
                DATABASE_URL=&quot;mysql://root:@localhost:3306/lms_nihongo&quot;
              </span>
            </li>
            <li className="font-mono text-xs text-slate-700">
              npm run db:push
              <span className="text-slate-500"> — đồng bộ schema (8 models, onDelete Cascade)</span>
            </li>
            <li className="font-mono text-xs text-slate-700">
              npm run db:seed
              <span className="text-slate-500"> — tạo dữ liệu mẫu (video N5 + subtitles)</span>
            </li>
            <li className="text-slate-600">
              Khởi động lại dev server: <span className="font-mono text-xs text-slate-700">npm run dev</span>
            </li>
          </ol>
          <p className="text-xs text-slate-500">
            Gợi ý: nếu MySQL vẫn báo lỗi port 3306, đổi port trong XAMPP (my.ini) hoặc tắt dịch vụ MySQL khác đang chiếm port.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
            <div className="aspect-video rounded-lg bg-sakura-100" />
            <div className="mt-3 h-4 w-3/4 rounded bg-sakura-100" />
            <div className="mt-2 h-3 w-1/2 rounded bg-sakura-50" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const sp = searchParams ? await searchParams : undefined;
  const rawLevel =
    typeof sp?.level === "string"
      ? sp.level
      : Array.isArray(sp?.level)
        ? sp.level[0]
        : undefined;
  const level = rawLevel && VALID_LEVELS[rawLevel] ? rawLevel : undefined;

  const rawCategory =
    typeof sp?.category === "string"
      ? sp.category
      : Array.isArray(sp?.category)
        ? sp.category[0]
        : undefined;
  const category = rawCategory && VALID_CATEGORIES[rawCategory] ? rawCategory : undefined;

  const rawQ = typeof sp?.q === "string" ? sp.q : Array.isArray(sp?.q) ? sp.q[0] : undefined;
  const q = rawQ?.trim() ? rawQ.trim() : undefined;

  const rawPage = typeof sp?.page === "string" ? sp.page : Array.isArray(sp?.page) ? sp.page[0] : undefined;
  const page = parsePage(rawPage);
  try {
    const where: Prisma.VideoWhereInput = {};
    const andFilters: Prisma.VideoWhereInput[] = [];
    if (level) andFilters.push({ level: level as Prisma.EnumLevelFilter["equals"] });
    if (category) andFilters.push({ category: category as unknown as Prisma.EnumVideoCategoryFilter["equals"] });
    if (q) {
      // MySQL: `contains` đã case-insensitive theo collation utf8mb4_*_ci.
      // KHÔNG dùng `mode: 'insensitive'` (chỉ Postgres hỗ trợ — Prisma P2010 trên MySQL).
      const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
      const searchOR = words.flatMap((word) => [
        { title: { contains: word } },
        { youtube_id: { contains: word } },
      ]);
      if (searchOR.length) {
        andFilters.push({ OR: searchOR } as Prisma.VideoWhereInput);
      }
    }
    if (andFilters.length) where.AND = andFilters;

    const total = await prisma.video.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * PAGE_SIZE;

    const videos = await prisma.video.findMany({
      where,
      include: {
        _count: { select: { subtitles: true } },
      },
      orderBy: { id: "asc" },
      skip,
      take: PAGE_SIZE,
    });

    // Tổng cho toàn DB (không lọc) để hiển thị thống kê header
    const [totalVideos, totalSubtitles] = await Promise.all([prisma.video.count(), prisma.subtitle.count()]);

    const filteredSubtitleCount = videos.reduce((sum, v) => sum + v._count.subtitles, 0);

    // Danh sách bộ anime (gom tập theo series) — GROUP BY trong SQL, chỉ 2 queries nhẹ
    // thay vì load 500 rows về RAM rồi group bằng JS.
    let animeSeries: Array<{ series: string; episodes: number; coverYoutubeId: string; level: string }> = [];
    if (!category || category === "ANIME") {
      try {
        const groups = await prisma.video.groupBy({
          by: ["series"],
          where: {
            category: "ANIME" as unknown as Prisma.EnumVideoCategoryFilter["equals"],
            series: { not: null },
          },
          _count: { _all: true },
          orderBy: { series: "asc" },
          take: 100,
        });
        const names = groups
          .map((g) => (g.series ?? "").trim())
          .filter(Boolean)
          .slice(0, 100);
        if (names.length) {
          // Cover = tập id nhỏ nhất của mỗi bộ (1 query duy nhất)
          const covers = await prisma.video.findMany({
            where: {
              category: "ANIME" as unknown as Prisma.EnumVideoCategoryFilter["equals"],
              series: { in: names },
            },
            select: { series: true, youtube_id: true, level: true, id: true },
            orderBy: { id: "asc" },
            take: 500,
          });
          const firstBySeries = new Map<string, { coverYoutubeId: string; level: string }>();
          for (const c of covers) {
            const name = (c.series ?? "").trim();
            if (!name || firstBySeries.has(name)) continue;
            firstBySeries.set(name, { coverYoutubeId: c.youtube_id, level: c.level });
          }
          animeSeries = groups.flatMap((g) => {
            const name = (g.series ?? "").trim();
            const cover = firstBySeries.get(name);
            if (!name || !cover) return [];
            return [{ series: name, episodes: g._count._all, ...cover }];
          });
        }
      } catch {
        animeSeries = [];
      }
    }

    const activeLabels: string[] = [];
    if (level) activeLabels.push(level);
    if (category) activeLabels.push(CATEGORY_LABEL[category] ?? category);
    if (q) activeLabels.push(`"${q}"`);
    const hasFilter = activeLabels.length > 0;
    // Streak data cho header — best effort, không làm hỏng dashboard nếu lỗi
    let streakInitialData: StreakData | null = null;
    try {
      const cu = await getCurrentUser();
      if (cu?.id) {
        streakInitialData = await getStreakDataForUser(cu.id, 90);
      }
    } catch {
      streakInitialData = null;
    }

    return (
      <div className="space-y-6">
        {/* Streak header — chỉ hiện khi đã đăng nhập */}
        {streakInitialData ? (
          <StreakFire initialData={streakInitialData} compact />
        ) : (
          <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-lg">🔥</span>
              <span>
                Đăng nhập để bắt đầu streak — làm flashcard hoặc test mỗi ngày để giữ lửa!
              </span>
            </div>
            <a
              href="/login"
              className="rounded-full bg-sakura-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-sakura-600 shadow-sm"
            >
              Đăng nhập
            </a>
          </div>
        )}
        {/* Feature quick access — 6 tính năng mới */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a href="/roadmap" className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm hover:border-sakura-300 hover:shadow-md transition">
            <div className="text-2xl">🗺️</div>
            <p className="mt-2 text-sm font-bold text-slate-800">Roadmap JLPT</p>
            <p className="text-xs text-slate-500">N5 → N1, tiến độ theo vocab & test</p>
          </a>
          <a href="/kanji" className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm hover:border-sakura-300 hover:shadow-md transition">
            <div className="text-2xl">✏️</div>
            <p className="mt-2 text-sm font-bold text-slate-800">Viết Kanji</p>
            <p className="text-xs text-slate-500">Canvas 280×280, lưu tiến độ</p>
          </a>
          <a href="/chat" className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm hover:border-sakura-300 hover:shadow-md transition">
            <div className="text-2xl">🐰</div>
            <p className="mt-2 text-sm font-bold text-slate-800">Chat Pekora</p>
            <p className="text-xs text-slate-500">Hỏi ngữ pháp, dịch câu peko!</p>
          </a>
          <a href="/flashcards" className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm hover:border-sakura-300 hover:shadow-md transition">
            <div className="text-2xl">🃏</div>
            <p className="mt-2 text-sm font-bold text-slate-800">Flashcard</p>
            <p className="text-xs text-slate-500">Lọc Đã học / Đang học / Xóa</p>
          </a>
        </div>
        {/* Shadowing gợi ý */}
        <div className="rounded-2xl border border-sakura-200 bg-gradient-to-r from-sakura-50 to-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">🎙️ Shadowing</p>
            <p className="text-xs text-slate-500">Mở video → chọn câu → Luyện shadowing (loop + ghi âm + chấm điểm) ở cột phải</p>
          </div>
          <span className="text-xs font-medium text-sakura-600">Trong mỗi /video/[id] → SubtitlePanel</span>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Trình độ</p>
            <LevelFilter />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Thể loại</p>
            <CategoryFilter />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tìm kiếm</p>
            <SearchInput />
          </div>
        </div>

        {/* Mục Anime — hiện tên bộ, bấm vào chọn tập */}
        {animeSeries.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">🎬 Anime — chọn bộ</h2>
              <a href="/?category=ANIME" className="text-xs font-semibold text-sakura-600 hover:underline">
                Xem tất cả tập →
              </a>
            </div>
            <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {animeSeries.map((s) => (
                <a
                  key={s.series}
                  href={`/anime/${encodeURIComponent(s.series)}`}
                  className="group block overflow-hidden rounded-2xl border border-sakura-200 bg-white hover:border-sakura-300 hover:shadow-md transition-all"
                >
                  <div className="relative aspect-video overflow-hidden bg-sakura-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://img.youtube.com/vi/${s.coverYoutubeId}/hqdefault.jpg`}
                      alt={s.series}
                      className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      loading="lazy"
                    />
                    <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-mono text-white">
                      {s.episodes} tập
                    </span>
                  </div>
                  <div className="p-3 bg-white">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 group-hover:text-sakura-700">
                      {s.series}
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-500">{s.episodes} tập • Bấm để chọn tập</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {videos.length === 0 ? (          <div className="rounded-xl border border-dashed border-sakura-300 bg-white p-10 text-center shadow-sm">
            <p className="text-slate-700 font-medium">
              Không có video nào {hasFilter ? `cho ${activeLabels.join(" · ")}` : ""}.
            </p>
            <p className="mt-1 text-sm text-slate-500">Thử chọn &quot;Tất cả&quot; hoặc điều chỉnh từ khóa tìm kiếm.</p>
            <a href="/" className="mt-4 inline-block rounded-full bg-sakura-500 px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-sakura-600 shadow-sm">
              Xem tất cả
            </a>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {videos.map((v) => (
                <VideoCard
                  key={v.id}
                  id={v.id}
                  youtube_id={v.youtube_id}
                  title={v.title}
                  level={v.level}
                  category={v.category}
                  duration={v.duration}
                  subtitleCount={v._count.subtitles}
                />
              ))}
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} />
            {total > PAGE_SIZE && (
              <p className="text-center text-xs text-slate-500">
                Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} trong tổng {total} video
                {hasFilter ? ` cho ${activeLabels.join(" · ")}` : ""}
              </p>
            )}
          </>
        )}
      </div>
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message + (err.stack ? "\n" + err.stack.slice(0, 800) : "") : String(err);
    return <DbFallback errorMessage={msg} />;
  }
}
