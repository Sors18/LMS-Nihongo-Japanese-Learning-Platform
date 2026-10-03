import { prisma } from "@/lib/prisma";
import VideoCard from "@/components/VideoCard";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AnimeSeriesPage({ params }: { params: Promise<{ series: string }> }) {
  const { series: raw } = await params;
  const series = decodeURIComponent(raw ?? "").trim();
  if (!series) notFound();

  const episodes = await prisma.video.findMany({
    where: { series },
    include: { _count: { select: { subtitles: true } } },
    orderBy: { id: "asc" },
  });
  if (episodes.length === 0) notFound();

  return (
    <div className="space-y-6">
      <div>
        <a href="/" className="text-xs font-semibold text-sakura-600 hover:underline">
          ← Trang chính
        </a>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800">🎬 {series}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {episodes.length} tập • Chọn tập để học — video chạy như các loại khác (phụ đề, tra từ, shadowing, test)
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {episodes.map((v, i) => (
          <div key={v.id} className="relative">
            <span className="absolute left-2 bottom-2 z-10 rounded-full bg-black/75 px-2.5 py-0.5 text-xs font-bold text-white">
              Tập {i + 1}
            </span>
            <VideoCard
              id={v.id}
              youtube_id={v.youtube_id}
              title={v.title}
              level={v.level}
              category={v.category}
              duration={v.duration}
              subtitleCount={v._count.subtitles}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
