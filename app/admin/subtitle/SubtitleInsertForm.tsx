"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { listSubtitlesAction, updateSubtitlesAction } from "@/app/actions/insertSubtitle";
import { formatMs, parseMsInput } from "@/lib/subtitleTime";
import { parseSubtitleInput } from "@/lib/subtitleParser";

type VideoOption = { id: number; youtube_id: string; title: string; level: string; _count: { subtitles: number } };

type Row = { key: number; start: string; end: string; text: string; vi: string };

let rowSeq = 1;
function toRow(s: { start_time_ms: number; end_time_ms: number; raw_text: string; translation?: string | null }): Row {
  return { key: rowSeq++, start: formatMs(s.start_time_ms), end: formatMs(s.end_time_ms), text: s.raw_text, vi: s.translation ?? "" };
}

export default function SubtitleInsertForm({ videos, preselectId }: { videos: VideoOption[]; preselectId?: number }) {
  const initial = preselectId && videos.some((v) => v.id === preselectId) ? String(preselectId) : videos[0] ? String(videos[0].id) : "";
  const [videoId, setVideoId] = useState<string>(initial);
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedVideoId, setLoadedVideoId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; videoId: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  // 2 chế độ: sửa từng dòng (mặc định) | dán mới toàn bộ
  const [tab, setTab] = useState<"edit" | "paste">("edit");
  const [pasteText, setPasteText] = useState("");

  const pasteCount = useMemo(() => {
    try {
      return parseSubtitleInput(pasteText).length;
    } catch {
      return 0;
    }
  }, [pasteText]);

  const selectedVideo = videos.find((v) => String(v.id) === videoId);

  // Đổi video → tải phụ đề hiện tại để sửa
  useEffect(() => {
    const vid = Number(videoId);
    if (!vid) {
      setRows([]);
      setLoadedVideoId(null);
      return;
    }
    setError(null);
    setResult(null);
    setRowErrors({});
    startTransition(async () => {
      try {
        const res = await listSubtitlesAction(vid);
        if (!res.ok) {
          setError(res.error ?? "Tải phụ đề thất bại");
          setRows([]);
          setLoadedVideoId(null);
          return;
        }
        setRows(res.subtitles.map(toRow));
        setLoadedVideoId(vid);
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Tải phụ đề thất bại");
        setRows([]);
        setLoadedVideoId(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const patchRow = (key: number, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setDirty(true);
    setResult(null);
    setRowErrors((prev) => {
      if (!prev[key]) return prev;
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  const deleteRow = (key: number) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setDirty(true);
    setResult(null);
  };

  const addRow = () => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const lastEnd = last ? parseMsInput(last.end) ?? 0 : 0;
      const start = lastEnd;
      const end = lastEnd + 3000;
      return [...prev, { key: rowSeq++, start: formatMs(start), end: formatMs(end), text: "", vi: "" }];
    });
    setDirty(true);
    setResult(null);
  };

  const handleSave = () => {
    setError(null);
    setResult(null);
    const vid = Number(videoId);
    if (!vid) {
      setError("Chưa chọn video");
      return;
    }
    const errs: Record<number, string> = {};
    const payload: Array<{ start_time_ms: number; end_time_ms: number; raw_text: string; translation: string | null }> = [];
    rows.forEach((r, idx) => {
      const start = parseMsInput(r.start);
      const end = parseMsInput(r.end);
      if (start === null) {
        errs[r.key] = `Dòng ${idx + 1}: giờ bắt đầu sai (VD 01:05.000)`;
        return;
      }
      if (end === null || end <= start) {
        errs[r.key] = `Dòng ${idx + 1}: giờ kết thúc phải sau bắt đầu`;
        return;
      }
      if (!r.text.trim()) {
        errs[r.key] = `Dòng ${idx + 1}: nội dung trống`;
        return;
      }
      payload.push({ start_time_ms: start, end_time_ms: end, raw_text: r.text.trim(), translation: r.vi.trim() || null });
    });
    setRowErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError(`Có ${Object.keys(errs).length} dòng lỗi — sửa các dòng đỏ bên dưới`);
      return;
    }
    savePayload(vid, payload, true);
  };

  const savePayload = (
    vid: number,
    payload: Array<{ start_time_ms: number; end_time_ms: number; raw_text: string; translation?: string | null }>,
    refreshRows: boolean
  ) => {
    startTransition(async () => {
      try {
        const res = await updateSubtitlesAction(vid, payload);
        if (!res.ok) {
          setError(res.error ?? "Lưu thất bại");
          return;
        }
        setResult({ count: res.count ?? 0, videoId: res.videoId ?? vid });
        setDirty(false);
        if (refreshRows) {
          // Tải lại để đồng bộ thứ tự đã sort
          const fresh = await listSubtitlesAction(vid);
          if (fresh.ok) setRows(fresh.subtitles.map(toRow));
        } else {
          setPasteText("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lưu thất bại");
      }
    });
  };

  const handlePasteSave = () => {
    setError(null);
    setResult(null);
    const vid = Number(videoId);
    if (!vid) {
      setError("Chưa chọn video");
      return;
    }
    if (!pasteText.trim()) {
      setError("Dán phụ đề vào ô (hỗ trợ SRT / VTT / mỗi dòng 1 câu)");
      return;
    }
    let parsed: Array<{ start_time_ms: number; end_time_ms: number; raw_text: string }>;
    try {
      parsed = parseSubtitleInput(pasteText);
    } catch {
      setError("Không parse được phụ đề — kiểm tra định dạng");
      return;
    }
    if (parsed.length === 0) {
      setError("Không parse được dòng nào — kiểm tra định dạng SRT/VTT");
      return;
    }
    savePayload(vid, parsed, false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sakura-200 bg-white p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div>
            <label className="text-sm font-medium text-slate-200">Chọn Video *</label>
            <select
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
            >
              {videos.length === 0 ? <option value="">— Chưa có video nào —</option> : null}
              {videos.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  #{v.id} — {v.title} [{v.level}] ({v._count.subtitles} sub) — {v.youtube_id}
                </option>
              ))}
            </select>
            {selectedVideo && (
              <p className="mt-1 text-xs text-slate-400">
                Đang chọn: <b className="text-slate-800">{selectedVideo.title}</b> — hiện có {selectedVideo._count.subtitles} phụ đề ·{" "}
                <a href={`/video/${selectedVideo.id}`} target="_blank" className="text-sky-400 hover:underline">
                  mở video ↗
                </a>
              </p>
            )}
          </div>

          <div className="rounded-lg border border-sakura-200 bg-sakura-50 p-3">
            <p className="text-xs font-semibold text-slate-600">Preview</p>
            {selectedVideo ? (
              <>
                <img src={`https://img.youtube.com/vi/${selectedVideo.youtube_id}/hqdefault.jpg`} alt="thumb" className="mt-2 w-full rounded-lg object-cover" loading="lazy" />
                <a href={`https://www.youtube.com/watch?v=${selectedVideo.youtube_id}`} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-xs text-sky-400 hover:underline">
                  Mở trên YouTube ↗
                </a>
              </>
            ) : (
              <div className="mt-2 flex h-32 items-center justify-center rounded-lg bg-black text-xs text-slate-500">Chưa chọn video</div>
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab("edit")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === "edit" ? "bg-sakura-500 text-white shadow-sm" : "border border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50"}`}
            >
              Sửa từng dòng
            </button>
            <button
              onClick={() => setTab("paste")}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === "paste" ? "bg-sakura-500 text-white shadow-sm" : "border border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50"}`}
            >
              Dán mới toàn bộ
            </button>
            {tab === "edit" && (
              <span className="ml-auto flex items-center gap-2">
                {loadedVideoId ? <span className="text-xs text-slate-500">video #{loadedVideoId}, {rows.length} dòng</span> : null}
                {dirty && <span className="rounded bg-amber-900/40 px-2 py-0.5 text-[11px] text-amber-300">chưa lưu</span>}
                <button onClick={addRow} disabled={isPending || !videoId} className="rounded-lg border border-emerald-600 bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50">
                  + Thêm dòng
                </button>
              </span>
            )}
          </div>

          {tab === "paste" ? (
            <div className="mt-3">
              <p className="text-xs text-slate-500">Dán SRT / VTT / mỗi dòng 1 câu — hỗ trợ <b className="text-slate-800">song ngữ</b> (câu Nhật + dòng dịch Việt ngay dưới) — sẽ <b className="text-amber-300">thay toàn bộ</b> phụ đề hiện tại. Parse được <b className={pasteCount > 0 ? "text-emerald-400" : "text-slate-800"}>{pasteCount}</b> dòng.</p>
              <textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setResult(null); }}
                rows={10}
                placeholder={`SRT:\n1\n00:00:00,000 --> 00:00:03,000\nこんにちは\n\nHoặc mỗi dòng 1 câu:\nこんにちは、はじめまして。\n私は田中です。`}
                className="mt-2 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <button onClick={handlePasteSave} disabled={isPending || !videoId || !pasteText.trim()} className="mt-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                {isPending ? "Đang lưu..." : `Ghi đè ${pasteCount > 0 ? `${pasteCount} dòng` : "phụ đề"}`}
              </button>
            </div>
          ) : (
          <>
          <p className="mt-1 text-xs text-slate-500">Giờ theo dạng <span className="font-mono text-slate-300">mm:ss.mmm</span> (VD 01:05.000) hoặc số giây. Sửa trực tiếp → bấm Lưu.</p>

          {isPending && rows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Đang tải phụ đề…</p>
          ) : rows.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-sakura-200 bg-sakura-50/50 p-6 text-center text-sm text-slate-500">
              Video này chưa có phụ đề. Bấm <b>+ Thêm dòng</b> để nhập từng câu.
            </div>
          ) : (
            <div className="mt-2 max-h-[480px] overflow-auto rounded-lg border border-sakura-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-sakura-50 text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 w-10">#</th>
                    <th className="px-3 py-1.5 w-28">Bắt đầu</th>
                    <th className="px-3 py-1.5 w-28">Kết thúc</th>
                    <th className="px-3 py-1.5">Nội dung (Nhật)</th>
                    <th className="px-3 py-1.5">Dịch Việt</th>
                    <th className="px-3 py-1.5 w-14"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {rows.map((r, idx) => (
                    <tr key={r.key} className={rowErrors[r.key] ? "bg-red-900/20" : "bg-white/50"}>
                      <td className="px-3 py-1 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-1">
                        <input
                          value={r.start}
                          onChange={(e) => patchRow(r.key, "start", e.target.value)}
                          className="w-full rounded border border-sakura-200 bg-sakura-50 px-2 py-1 font-mono text-amber-300 focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          value={r.end}
                          onChange={(e) => patchRow(r.key, "end", e.target.value)}
                          className="w-full rounded border border-sakura-200 bg-sakura-50 px-2 py-1 font-mono text-sky-300 focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          value={r.text}
                          onChange={(e) => patchRow(r.key, "text", e.target.value)}
                          placeholder="Nội dung câu…"
                          className="w-full rounded border border-sakura-200 bg-sakura-50 px-2 py-1 text-slate-800 focus:border-sky-500 focus:outline-none"
                        />
                        {rowErrors[r.key] && <p className="mt-0.5 text-[11px] text-red-300">{rowErrors[r.key]}</p>}
                      </td>
                      <td className="px-3 py-1">
                        <input
                          value={r.vi}
                          onChange={(e) => patchRow(r.key, "vi", e.target.value)}
                          placeholder="Bản dịch Việt…"
                          className="w-full rounded border border-sakura-200 bg-sakura-50 px-2 py-1 text-slate-600 focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-1 text-right">
                        <button onClick={() => deleteRow(r.key)} title="Xóa dòng" className="rounded px-2 py-1 text-red-400 hover:bg-red-900/30">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>
          )}
        </div>

        {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}

        {tab === "edit" && (
        <div className="flex flex-wrap gap-3">
          <button onClick={handleSave} disabled={isPending || !videoId || !dirty} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
            {isPending ? "Đang lưu..." : "Lưu phụ đề"}
          </button>
          {result && (
            <a href={`/video/${result.videoId}`} className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-sky-500">
              Mở video #{result.videoId} để test →
            </a>
          )}
        </div>
        )}
        {tab === "paste" && result && (
          <a href={`/video/${result.videoId}`} className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-sky-500">
            Mở video #{result.videoId} để test →
          </a>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-900/20 p-3 text-sm">
            <p className="font-semibold text-emerald-300">✓ Đã lưu {result.count} phụ đề vào video #{result.videoId}</p>
            <p className="mt-1 text-xs text-slate-600">Mở video → kiểm tra phụ đề chạy đồng bộ. Sửa text không quét lại vocab/grammar — bấm Trích xuất ở trang video nếu đổi nhiều.</p>
          </div>
        )}
      </div>
    </div>
  );
}
