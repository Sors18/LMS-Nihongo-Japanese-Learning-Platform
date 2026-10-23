"use client";

import { useState, useTransition } from "react";
import { extractGrammarFromVideo } from "@/app/actions/extractGrammar";
import ExtractionProgressModal, { useExtractionJob } from "./ExtractionProgress";
import TablePager, { getPageCount, clampPage, paginateList } from "./TablePager";

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Types — handle both shapes:
// - { grammar: { id, structure, explanation, level }, appear_at_ms, matched_text? }
// - { structure, explanation, appear_at_ms, grammarId, level }
// ---------------------------------------------------------------------------
type GrammarInfo = {
  id?: number;
  structure: string;
  explanation: string;
  level?: string | null;
};

type MatchItem = {
  grammar?: GrammarInfo;
  structure?: string;
  explanation?: string;
  level?: string | null;
  grammarId?: number;
  id?: number;
  appear_at_ms: number;
  matched_text?: string | null;
};

type Props = {
  videoId: number;
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "h-4 w-4"}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function normalizeMatch(raw: unknown): MatchItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // shape 1: nested grammar
  if (r.grammar && typeof r.grammar === "object") {
    const g = r.grammar as Record<string, unknown>;
    if (typeof g.structure === "string" && typeof g.explanation === "string" && typeof r.appear_at_ms === "number") {
      return {
        grammar: {
          id: typeof g.id === "number" ? g.id : undefined,
          structure: g.structure,
          explanation: g.explanation,
          level: typeof g.level === "string" ? g.level : null,
        },
        appear_at_ms: r.appear_at_ms,
        matched_text: typeof r.matched_text === "string" ? r.matched_text : null,
      };
    }
  }
  // shape 2: flat
  if (typeof r.structure === "string") {
    const appear = typeof r.appear_at_ms === "number" ? r.appear_at_ms : typeof r.appearAtMs === "number" ? (r.appearAtMs as number) : null;
    if (appear === null) return null;
    return {
      structure: r.structure,
      explanation: typeof r.explanation === "string" ? r.explanation : "",
      level: typeof r.level === "string" ? r.level : null,
      grammarId: typeof r.grammarId === "number" ? r.grammarId : undefined,
      id: typeof r.id === "number" ? r.id : undefined,
      appear_at_ms: appear,
      matched_text: typeof r.matched_text === "string" ? r.matched_text : null,
    };
  }
  return null;
}
function PagedMatches({
  matches,
  page,
  onPage,
}: {
  matches: MatchItem[];
  page: number;
  onPage: (page: number) => void;
}) {
  const totalPages = getPageCount(matches.length, PAGE_SIZE);
  const safePage = clampPage(page, totalPages);
  const paged = paginateList(matches, safePage, PAGE_SIZE);
  return (
    <>
      <ul className="mt-4 mx-auto max-w-2xl space-y-2 divide-y divide-sakura-100 overflow-hidden rounded-xl border border-sakura-100 bg-white p-2">
        {paged.map((m, idx) => {
          const structure = m.grammar?.structure ?? m.structure ?? "—";
          const explanation = m.grammar?.explanation ?? m.explanation ?? "";
          const level = m.grammar?.level ?? m.level ?? null;
          return (
            <li
              key={`${structure}__${m.appear_at_ms}__${idx}`}
              className="mx-1 flex gap-3 rounded-lg bg-sakura-50/50 px-4 py-2.5 transition-colors hover:bg-sakura-50"
            >
              <span className="shrink-0 self-center rounded-full border border-sakura-200 bg-white px-2.5 py-1 font-mono text-xs font-medium text-sakura-700 shadow-sm">
                {formatMs(m.appear_at_ms)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{structure}</span>
                  {level && <span className="rounded-full border border-sakura-200 bg-sakura-100 px-1.5 py-0.5 text-[11px] font-medium text-sakura-700">{level}</span>}
                  {m.matched_text && <span className="text-xs italic text-slate-500">&ldquo;{m.matched_text}&rdquo;</span>}
                </div>
                {explanation && <p className="mt-1 text-xs leading-relaxed text-slate-600">{explanation}</p>}
                <p className="mt-1 text-[11px] text-slate-400">appear_at_ms: {m.appear_at_ms}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {totalPages > 1 && (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, matches.length)} trong {matches.length} mẫu
        </p>
      )}
      <TablePager page={safePage} totalPages={totalPages} onPage={onPage} />
    </>
  );
}
export default function GrammarExtractor({ videoId }: Props) {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const { progress, run: runJob, cancel: cancelJob } = useExtractionJob();
  const scanning = isPending || progress !== null;

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleScan = () => {
    setError(null);
    startTransition(async () => {
      const applyResult = (res: unknown) => {
        const arr = Array.isArray(res) ? res : [];
        const normalized = arr.map(normalizeMatch).filter((x): x is MatchItem => x !== null);
        setMatches(normalized);
        setPage(1);
        if (normalized.length === 0) showToast("Không phát hiện mẫu ngữ pháp");
        else showToast(`Đã quét ${normalized.length} điểm ngữ pháp`);
      };
      try {
        // SSE: popup % tiến trình; lỗi stream → fallback gọi action trực tiếp
        applyResult(await runJob("/api/extract/grammar", { videoId }, "Quét ngữ pháp"));
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        try {
          applyResult(await extractGrammarFromVideo(videoId));
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : "Quét ngữ pháp thất bại");
        }
      }
    });
  };


  return (
    <div className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Ngữ pháp trong video</h3>
          <p className="mt-0.5 text-xs text-slate-500">Quét pattern từ phụ đề · Video #{videoId}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-full bg-sakura-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sakura-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning && <Spinner className="h-4 w-4 text-white" />}
            {scanning ? "Đang quét…" : "Quét ngữ pháp"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {matches.length > 0 ? (
        <PagedMatches matches={matches} page={page} onPage={setPage} />
      ) : (
        !scanning &&
        !error && <p className="mt-3 text-xs text-slate-500">Nhấn &ldquo;Quét ngữ pháp&rdquo; để phát hiện mẫu câu từ phụ đề.</p>
      )}

        </>
      )}
      {matches.length > 0 && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-3 text-xs text-slate-400 hover:text-sakura-600"
        >
          {collapsed ? "▸ Mở rộng" : "▾ Thu gọn"}
        </button>
      )}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-xl border border-sakura-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
      <ExtractionProgressModal job={progress} onCancel={cancelJob} />
    </div>
  );
}
