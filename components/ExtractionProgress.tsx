"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Popup tiến trình cho job trích xuất dài (vocab / grammar qua SSE).
// useExtractionJob().run(url, body, title) → resolve payload, throw khi lỗi/hủy.
// ---------------------------------------------------------------------------

export type ExtractionProgress = {
  title: string;
  stage: string;
  percent: number;
};

export function useExtractionJob() {
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(
    async (url: string, body: unknown, title: string): Promise<unknown> => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setProgress({ title, stage: "Bắt đầu…", percent: 0 });
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Lỗi máy chủ (HTTP ${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const msg = JSON.parse(line.slice(5)) as {
              ok?: boolean;
              payload?: unknown;
              error?: string;
              stage?: string;
              percent?: number;
            };
            if (msg.ok === true) {
              setProgress(null);
              return msg.payload;
            }
            if (msg.ok === false) throw new Error(msg.error || "Trích xuất thất bại");
            setProgress({ title, stage: msg.stage ?? "Đang xử lý…", percent: Math.max(0, Math.min(100, msg.percent ?? 0)) });
          }
        }
        throw new Error("Kết nối bị ngắt giữa chừng");
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    []
  );

  return { progress, run, cancel };
}

export default function ExtractionProgressModal({
  job,
  onCancel,
}: {
  job: ExtractionProgress | null;
  onCancel: () => void;
}) {
  // Thu gọn khi bấm ✕ (job vẫn chạy nền) — tự bung lại khi có job mới
  const [minimized, setMinimized] = useState(false);
  const jobKey = job ? `${job.title}` : "";
  useEffect(() => {
    if (jobKey) setMinimized(false);
  }, [jobKey]);
  if (!job) return null;
  // Popup góc TRÁI dưới (góc phải là nút chat Pekora) — gọn, không chặn màn hình
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Hiện tiến trình trích xuất"
        data-testid="extraction-progress-minimized"
        className="fixed bottom-4 left-4 z-[90] inline-flex items-center gap-2 rounded-full border border-sakura-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-sakura-700 shadow-lg hover:bg-sakura-50"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-sakura-500" />
        {job.title} · {job.percent}%
      </button>
    );
  }
  return (
    <div className="fixed bottom-4 left-4 z-[90] w-72 rounded-2xl border border-sakura-200 bg-white p-3 shadow-xl" data-testid="extraction-progress">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-bold text-slate-800">{job.title}</h3>
          <p className="mt-0.5 truncate text-[11px] text-slate-500" title={job.stage}>{job.stage}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            title="Ẩn (vẫn chạy nền)"
            className="rounded-full border border-sakura-200 bg-white px-2 py-0.5 text-[11px] font-medium text-sakura-700 hover:bg-sakura-50"
          >
            ✕
          </button>
          <button
            onClick={onCancel}
            title="Hủy trích xuất"
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:underline"
          >
            Hủy
          </button>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sakura-100">
        <div
          className="h-full rounded-full bg-sakura-500 transition-[width] duration-300"
          style={{ width: `${job.percent}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[11px] font-semibold text-sakura-700">{job.percent}%</p>
    </div>
  );
}
