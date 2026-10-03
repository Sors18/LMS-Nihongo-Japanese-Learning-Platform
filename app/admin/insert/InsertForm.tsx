"use client";

import { useState, useTransition } from "react";
import { insertVideoAction } from "@/app/actions/insertVideo";
import { useRouter } from "next/navigation";
import ExtractionProgressModal, { useExtractionJob } from "@/components/ExtractionProgress";

function extractYoutubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (u.searchParams.get("v")) {
      const v = u.searchParams.get("v")!;
      if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
  } catch {}
  const m = s.match(/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function InsertForm() {
  const router = useRouter() as unknown as { refresh: () => void };
  const [youtubeUrlOrId, setYoutubeUrlOrId] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<"N5" | "N4" | "N3" | "N2" | "N1">("N5");
  const [category, setCategory] = useState<"SHORT" | "KAIWA" | "SONG" | "ANIME">("SHORT");
  const [series, setSeries] = useState("");
  const [duration, setDuration] = useState<string>("300");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ videoId: number; youtube_id: string; subtitleCount: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { progress, run: runJob, cancel: cancelJob } = useExtractionJob();
  const busy = isPending || progress !== null;

  const previewId = extractYoutubeId(youtubeUrlOrId);
  const previewThumb = previewId ? `https://img.youtube.com/vi/${previewId}/hqdefault.jpg` : null;

  const handleSubmit = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const dur = duration.trim() ? Number(duration) : undefined;
      const payload = { youtubeUrlOrId, title, level, category, series, duration: dur, transcript };
      const applyResult = (res: { ok: boolean; error?: string; videoId?: number; youtube_id?: string; subtitleCount?: number }) => {
        if (!res.ok) {
          setError(res.error ?? "Tạo thất bại");
          return;
        }
        setResult({ videoId: res.videoId ?? 0, youtube_id: res.youtube_id ?? "", subtitleCount: res.subtitleCount ?? 0 });
        router.refresh();
      };
      try {
        // SSE: popup % (tạo → tách từ → vocab → ngữ pháp); lỗi stream → fallback action trực tiếp
        applyResult((await runJob("/api/admin/insert-video", payload, "Đang thêm video")) as {
          ok: boolean;
          error?: string;
          videoId?: number;
          youtube_id?: string;
          subtitleCount?: number;
        });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        try {
          applyResult(await insertVideoAction(payload));
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : "Tạo thất bại");
        }
      }
    });
  };

  return (
    <div className="rounded-xl border border-sakura-200 bg-white p-5 space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-200">Link YouTube hoặc ID *</label>
            <input
              value={youtubeUrlOrId}
              onChange={(e) => setYoutubeUrlOrId(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ hoặc dQw4w9WgXcQ"
              className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
            {previewId ? (
              <p className="mt-1 text-xs text-emerald-400">✓ ID: {previewId}</p>
            ) : youtubeUrlOrId ? (
              <p className="mt-1 text-xs text-amber-400">Chưa parse được ID — kiểm tra lại link</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-200">Tiêu đề *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Bài 3: Mua sắm ở siêu thị (N5)"
              className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-200">Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as unknown as typeof level)}
                className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="N5">N5</option>
                <option value="N4">N4</option>
                <option value="N3">N3</option>
                <option value="N2">N2</option>
                <option value="N1">N1</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">Thể loại</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as unknown as typeof category)}
                className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="SHORT">Video ngắn</option>
                <option value="KAIWA">Video Kaiwa</option>
                <option value="SONG">Bài hát</option>
                <option value="ANIME">Anime</option>
              </select>
              {category === "ANIME" && (
                <div className="mt-2">
                  <label className="text-sm font-medium text-slate-200">Tên bộ (series)</label>
                  <input
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    placeholder="VD: Frieren — các tập cùng bộ nhập giống nhau"
                    className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Các tập cùng tên bộ sẽ gom ở trang /anime/[tên-bộ]</p>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">Duration (giây)</label>
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="300"
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">Để trống = 300s</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-sakura-200 bg-sakura-50 p-3">
          <p className="text-xs font-semibold text-slate-600">Preview</p>
          {previewThumb ? (
            <img src={previewThumb} alt="thumb" className="mt-2 w-full rounded-lg object-cover" loading="lazy" />
          ) : (
            <div className="mt-2 flex h-32 items-center justify-center rounded-lg bg-black text-xs text-slate-500">Chưa có thumbnail</div>
          )}
          {previewId && (
            <a href={`https://www.youtube.com/watch?v=${previewId}`} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-xs text-sky-400 hover:underline">
              Mở trên YouTube ↗
            </a>
          )}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-200">Transcript (mỗi dòng 1 câu) — tùy chọn nhưng nên có để test</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={8}
          placeholder={`こんにちは、はじめまして。\n私は田中です。よろしくお願いします。\n今日は天気がいいですね。\n... paste transcript ở đây — mỗi dòng sẽ thành 1 Subtitle 3s`}
          className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-slate-500">Sẽ tự chia 3s/dòng: 0-2800ms, 3000-5800ms… Muốn chính xác hơn thì sửa trong Prisma Studio sau.</p>
      </div>

      {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSubmit}
          disabled={busy || !youtubeUrlOrId.trim() || !title.trim()}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Đang tạo..." : "Tạo Video"}
        </button>
        {result && (
          <a href={`/video/${result.videoId}`} className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-sky-500">
            Mở video #{result.videoId} để test →
          </a>
        )}
      </div>

      {result && (
        <div className="rounded-lg border border-emerald-700 bg-emerald-900/20 p-3 text-sm">
          <p className="font-semibold text-emerald-300">✓ Đã tạo video id={result.videoId} — {result.subtitleCount} phụ đề</p>
          <p className="mt-1 text-xs text-slate-600">
            Tiếp theo: mở video → bấm <b>Trích xuất từ vựng</b> → <b>Quét ngữ pháp</b> → <b>Tự tạo test</b> → <b>onEnded</b> tự mở test hoặc bấm{" "}
            <b>Làm bài ngay</b>.
          </p>
          <div className="mt-2 flex gap-2 text-xs">
            <a href="/" className="text-sky-400 hover:underline">Dashboard</a>
            <span className="text-slate-500">·</span>
            <a href="/history" className="text-sky-400 hover:underline">Lịch sử</a>
            <span className="text-slate-500">·</span>
            <a href="/flashcards" className="text-sky-400 hover:underline">Flashcard</a>
          </div>
        </div>
      )}
      <ExtractionProgressModal job={progress} onCancel={cancelJob} />
    </div>
  );
}
