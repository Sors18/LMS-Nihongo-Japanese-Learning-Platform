"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { deleteVideoAction, updateVideoAction } from "@/app/actions/manageVideo";
import Pagination from "@/components/Pagination";

type VideoRow = {
  id: number;
  youtube_id: string;
  title: string;
  level: string;
  category?: string;
  series?: string | null;
  duration: number;
  _count: { subtitles: number; questions: number; grammar_points: number };
};

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return <>{text}</>;
  const pattern = terms.map(escapeRegExp).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  const testRe = new RegExp(`^(${pattern})$`, "i");
  return (
    <>
      {parts.map((part, i) =>
        part && testRe.test(part) ? (
          <mark
            key={i}
            className="bg-yellow-200 text-yellow-900 rounded px-0.5 font-medium"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function VideosAdminClient({
  videos: initialVideos,
  query: initialQuery = "",
  total,
  totalPages = 1,
  currentPage = 1,
}: {
  videos: VideoRow[];
  query?: string;
  total?: number;
  totalPages?: number;
  currentPage?: number;
}) {
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const searchParams = useSearchParams() as unknown as URLSearchParams;
  // Ưu tiên q từ URL (đồng bộ với server), fallback initialQuery để highlight ngay sau SSR
  const urlQuery = searchParams.get("q") ?? initialQuery ?? "";
  const highlightQuery = urlQuery;

  const resolvedTotal = total ?? initialVideos.length;
  const resolvedTotalPages = totalPages ?? 1;
  const resolvedCurrentPage = currentPage ?? 1;

  const [videos, setVideos] = useState(initialVideos);
  const [editing, setEditing] = useState<VideoRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editYoutube, setEditYoutube] = useState("");
  const [editLevel, setEditLevel] = useState<"N5" | "N4" | "N3" | "N2" | "N1">("N5");
  const [editDuration, setEditDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Search input cho admin — debounce scroll:false, truyền q giống dashboard filter đã sửa
  const [searchValue, setSearchValue] = useState(urlQuery);
  const debounceRef = useRef<number | NodeJS.Timeout | null>(null);
  const firstRender = useRef(true);

  // Sync khi URL hoặc initialVideos/initialQuery thay đổi (back/forward, server filter)
  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== searchValue) {
      setSearchValue(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    clearTimeout(debounceRef.current as unknown as number);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchValue.trim();
      if (!trimmed) params.delete("q");
      else params.set("q", trimmed);
      // reset về trang 1 khi search thay đổi
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `/admin/videos?${qs}` : "/admin/videos", { scroll: false });
    }, 400);
    return () => {
      clearTimeout(debounceRef.current as unknown as number);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  function clearSearch() {
    setSearchValue("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/admin/videos?${qs}` : "/admin/videos", { scroll: false });
  }

  // Optional client-side fallback filter nếu server chưa filter (giữ đồng bộ highlight)
  const filteredVideos = useMemo(() => {
    // Nếu server đã filter theo where, videos đã là filtered; không cần re-filter
    // Nhưng giữ highlight dựa trên highlightQuery — pagination đã xử lý ở server skip/take
    return videos;
  }, [videos]);

  const openEdit = (v: VideoRow) => {
    setEditing(v);
    setEditTitle(v.title);
    setEditYoutube(v.youtube_id);
    setEditLevel(v.level as "N5" | "N4" | "N3" | "N2" | "N1");
    setEditDuration(String(v.duration));
    setError(null);
    setSuccess(null);
  };

  const handleUpdate = () => {
    if (!editing) return;
    setError(null);
    setSuccess(null);
    const duration = Number(editDuration);
    startTransition(async () => {
      const res = await updateVideoAction({
        videoId: editing.id,
        title: editTitle,
        youtubeUrlOrId: editYoutube,
        level: editLevel,
        duration,
      });
      if (!res.ok) setError(res.error);
      else {
        setSuccess(`Đã cập nhật video #${editing.id}`);
        setVideos((prev) => prev.map((x) => (x.id === editing.id ? { ...x, title: editTitle.trim(), youtube_id: res.video.youtube_id, level: editLevel, duration } : x)));
        setEditing(null);
      }
    });
  };

  const handleDelete = (id: number) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteVideoAction(id);
      if (!res.ok) setError(res.error);
      else {
        setSuccess(`Đã xóa video #${id}`);
        setVideos((prev) => prev.filter((x) => x.id !== id));
        setDeleteConfirm(null);
      }
    });
  };

  if (filteredVideos.length === 0) {
    return (
      <div className="space-y-4">
        {/* Search bar vẫn hiện khi empty để clear filter */}
        <div className="relative w-full max-w-md">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Tìm theo tiêu đề hoặc YouTube ID..."
            aria-label="Tìm kiếm video admin"
            className="w-full rounded-full border border-sakura-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:border-sakura-300 focus:outline-none focus:ring-2 focus:ring-sakura-200"
          />
          {searchValue && (
            <button
              onClick={clearSearch}
              aria-label="Xóa tìm kiếm"
              className="absolute inset-y-0 right-2 flex items-center rounded-full px-2 text-slate-400 hover:text-slate-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
        {highlightQuery && (
          <p className="text-sm text-slate-500">
            Không tìm thấy kết quả cho <span className="font-semibold text-slate-700">“{highlightQuery}”</span> — thử từ khóa khác.
          </p>
        )}
        <div className="rounded-xl border border-sakura-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-400">Chưa có video nào.</p>
          <div className="mt-4 flex justify-center gap-2">
            <a href="/admin/insert" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-emerald-500">+ Thêm Video</a>
            <a href="/" className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-700">Dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">{success}</p>}

      {/* Admin search — debounce scroll:false, highlight vàng */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Tìm theo tiêu đề hoặc YouTube ID..."
            aria-label="Tìm kiếm video admin"
            className="w-full rounded-full border border-sakura-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:border-sakura-300 focus:outline-none focus:ring-2 focus:ring-sakura-200"
          />
          {searchValue && (
            <button
              onClick={clearSearch}
              aria-label="Xóa tìm kiếm"
              className="absolute inset-y-0 right-2 flex items-center rounded-full px-2 text-slate-400 hover:text-slate-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
        {highlightQuery ? (
          <p className="text-sm text-slate-500">
            Tìm thấy <span className="font-semibold text-slate-700">{resolvedTotal}</span> kết quả cho{" "}
            <span className="font-semibold text-sakura-600">“{highlightQuery}”</span>
            {resolvedTotalPages > 1 && <span className="text-slate-400"> · Trang {resolvedCurrentPage}/{resolvedTotalPages}</span>}
          </p>
        ) : (
          <p className="text-sm text-slate-400">Tổng {resolvedTotal} video{resolvedTotalPages > 1 ? ` · Trang ${resolvedCurrentPage}/${resolvedTotalPages}` : ""}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-sakura-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-sakura-50 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Thumbnail</th>
              <th className="px-3 py-2">Tiêu đề / YouTube</th>
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2">Thể loại</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Phụ đề / Q / G</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50 bg-white">
            {filteredVideos.map((v) => (
              <tr key={v.id} className="hover:bg-slate-700/40">
                <td className="px-3 py-2 font-mono text-xs text-sakura-700">#{v.id}</td>
                <td className="px-3 py-2">
                  <img src={`https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg`} alt={v.title} className="h-12 w-20 rounded object-cover" loading="lazy" />
                </td>
                <td className="px-3 py-2">
                  <p className="max-w-[260px] truncate font-medium text-sakura-900">
                    <HighlightText text={v.title} query={highlightQuery} />
                  </p>
                  <p className="font-mono text-xs text-sakura-600">
                    <HighlightText text={v.youtube_id} query={highlightQuery} />
                  </p>
                  <a href={`https://www.youtube.com/watch?v=${v.youtube_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">YouTube ↗</a>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold text-sakura-700">{v.level}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold text-sakura-700">{v.category ?? "SHORT"}</span>
                  {v.series ? (
                    <p className="mt-1 max-w-[140px] truncate text-[11px] text-slate-500" title={v.series}>🎬 {v.series}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-sakura-700">{formatDuration(v.duration)}</td>
                <td className="px-3 py-2 text-xs">
                  <div className="flex min-w-[92px] flex-col items-start gap-1">
                    <a
                      href={`/admin/subtitle?videoId=${v.id}`}
                      title="Sửa phụ đề"
                      className="inline-flex items-center rounded-full border border-sakura-200 bg-sakura-50 px-2 py-0.5 font-semibold text-sakura-700 hover:bg-sakura-100"
                    >
                      {v._count.subtitles} sub
                    </a>
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                        Q {v._count.questions}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                        G {v._count.grammar_points}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-[68px] flex-col items-end gap-1">
                    <a href={`/video/${v.id}`} className="w-16 rounded-full bg-sky-500 px-2 py-1 text-center text-xs font-semibold text-white hover:bg-sky-600 shadow-sm">Xem</a>
                    <button onClick={() => openEdit(v)} className="w-16 rounded-full bg-amber-500 px-2 py-1 text-center text-xs font-semibold text-white hover:bg-amber-600 shadow-sm">Sửa</button>
                    {deleteConfirm === v.id ? (
                      <>
                        <button onClick={() => handleDelete(v.id)} disabled={isPending} className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-sm">Xác nhận?</button>
                        <button onClick={() => setDeleteConfirm(null)} className="rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-sakura-50">Hủy</button>
                      </>
                    ) : (
                      <button onClick={() => setDeleteConfirm(v.id)} className="w-16 rounded-full border-2 border-red-300 bg-white px-2 py-1 text-center text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm">Xóa</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination — giữ search highlight đã có */}
      <Pagination currentPage={resolvedCurrentPage} totalPages={resolvedTotalPages} />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-sakura-200 bg-white p-5 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Sửa video #{editing.id}</h3>
            <a
              href={`/admin/subtitle?videoId=${editing.id}`}
              className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
            >
              <span>💬 Phụ đề: {editing._count.subtitles} dòng</span>
              <span aria-hidden>→</span>
            </a>
            <div>
              <label className="text-sm font-medium text-slate-200">Tiêu đề *</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">YouTube link / ID *</label>
              <input value={editYoutube} onChange={(e) => setEditYoutube(e.target.value)} placeholder="https://www.youtube.com/watch?v=XXXX hoặc ID" className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-200">Level</label>
                <select value={editLevel} onChange={(e) => setEditLevel(e.target.value as "N5" | "N4" | "N3" | "N2" | "N1")} className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none">
                  <option value="N5">N5</option><option value="N4">N4</option><option value="N3">N3</option><option value="N2">N2</option><option value="N1">N1</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Duration (giây)</label>
                <input value={editDuration} onChange={(e) => setEditDuration(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none" />
              </div>
            </div>
            {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-700">Hủy</button>
              <button onClick={handleUpdate} disabled={isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-emerald-500 disabled:opacity-50">{isPending ? "Đang lưu..." : "Lưu"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
