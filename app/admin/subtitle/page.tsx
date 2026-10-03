import { prisma } from "@/lib/prisma";
import SubtitleInsertForm from "./SubtitleInsertForm";

export const metadata = { title: "Sửa Phụ đề — LMS Nihongo" };

export default async function AdminSubtitlePage({ searchParams }: { searchParams?: Promise<{ videoId?: string }> }) {
  const sp = searchParams ? await searchParams : undefined;
  const preselectId = sp?.videoId ? Number(sp.videoId) : undefined;
  let videos: Array<{ id: number; youtube_id: string; title: string; level: string; _count: { subtitles: number } }> = [];
  let error: string | null = null;
  try {
    videos = await prisma.video.findMany({
      orderBy: { id: "desc" },
      select: { id: true, youtube_id: true, title: true, level: true, _count: { select: { subtitles: true } } },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sửa Phụ đề</h1>
        <p className="mt-1 text-sm text-slate-400">
          Chọn video → sửa trực tiếp từng dòng (giờ + nội dung) → Lưu. Không cần nhập lại toàn bộ.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6">
          <h2 className="font-semibold text-amber-300">Không kết nối được MySQL</h2>
          <pre className="mt-2 overflow-auto rounded bg-black/40 p-3 text-xs text-amber-100/80">{error}</pre>
          <p className="mt-2 text-sm text-slate-600">Kiểm tra XAMPP → Start MySQL, tạo DB lms_nihongo, chạy <code>npm run db:push && npm run db:seed</code></p>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-sakura-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600">Chưa có video nào.</p>
          <a href="/admin/insert" className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-emerald-500">
            Tạo video trước →
          </a>
        </div>
      ) : (
        <SubtitleInsertForm videos={videos} preselectId={preselectId} />
      )}

    </div>
  );
}
