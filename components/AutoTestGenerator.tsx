"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearVideoQuestions, generateTestFromVideo } from "@/app/actions/generateTest";

type GeneratedQuestion = {
  id?: number;
  question_type?: string;
  type?: string;
  content: string;
  question?: string;
  options?: unknown;
  correct_answer?: string;
  answer?: string;
};

type GenerateResult = {
  created?: number;
  count?: number;
  questions?: GeneratedQuestion[];
  data?: GeneratedQuestion[];
  ok?: boolean;
};

type Props = {
  videoId: number;
  existingCount?: number;
  /** true nếu là ADMIN — được Xóa / Tạo lại (ghi đè). USER chỉ được tạo khi chưa có đề. */
  isAdmin?: boolean;
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "h-4 w-4"}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function parseQuestions(raw: unknown): GeneratedQuestion[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as GeneratedQuestion[];
  if (typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.questions)) return r.questions as GeneratedQuestion[];
    if (Array.isArray(r.data)) return r.data as GeneratedQuestion[];
  }
  return [];
}

function normalizeCount(res: unknown, questions: GeneratedQuestion[]): number {
  if (typeof res === "object" && res !== null) {
    const r = res as Record<string, unknown>;
    if (typeof r.created === "number") return r.created;
    if (typeof r.count === "number") return r.count;
  }
  return questions.length;
}

function parseOptions(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
      if (typeof parsed === "object" && parsed !== null && "options" in (parsed as Record<string, unknown>)) {
        const opts = (parsed as Record<string, unknown>).options;
        if (Array.isArray(opts)) return opts.map(String);
      }
    } catch {
      return [];
    }
  }
  if (typeof raw === "object" && raw !== null && "options" in (raw as Record<string, unknown>)) {
    const opts = (raw as Record<string, unknown>).options;
    if (Array.isArray(opts)) return opts.map(String);
  }
  return [];
}

const COUNT_OPTIONS = [5, 8, 10, 15, 20] as const;

export default function AutoTestGenerator({ videoId, existingCount = 0, isAdmin = false }: Props) {
  const router = useRouter() as unknown as { refresh: () => void };
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<GeneratedQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [isPending, startTransition] = useTransition();
  const [isClearing, startClearTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  // USER thường chỉ được tạo khi chưa có đề (đề dùng chung); ADMIN mới được ghi đè/xóa.
  const canGenerate = isAdmin || existingCount === 0;

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      try {
        // ADMIN tự ghi đè khi đã có đề; USER bị server chặn overwrite nên chỉ tạo mới
        const opts = existingCount > 0 ? { count: questionCount, overwrite: isAdmin } : { count: questionCount };
        const raw = (await (generateTestFromVideo as unknown as (a: number, b?: unknown) => Promise<unknown>)(videoId, opts)) as unknown;
        // Bắt trường hợp server trả về skipped (do race khi DB chưa sync)
        const skipped = typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).skipped === true;
        if (skipped) {
          const ec = (raw as Record<string, unknown>).existingCount as number | undefined;
          setError(
            isAdmin
              ? `Đã có ${ec ?? existingCount} câu — bấm “Xóa” rồi tạo lại, hoặc bấm “Tạo lại (ghi đè)”`
              : `Đã có ${ec ?? existingCount} câu — bấm “Làm bài ngay” để thi (chỉ ADMIN mới được tạo lại)`
          );
          return;
        }
        const qs = parseQuestions(raw);
        const count = normalizeCount(raw, qs);
        if (qs.length === 0 && count === 0) {
          setError("Không tạo được câu hỏi — video thiếu phụ đề/từ vựng/ngữ pháp (hãy kiểm tra Video #2 có phụ đề và đã Quét ngữ pháp)");
          return;
        }
        setPreviewQuestions(qs.length > 0 ? qs : Array.isArray(raw) ? (raw as GeneratedQuestion[]) : []);
        setResult(typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as GenerateResult) : { count, questions: qs });
        showToast(`Đã tạo ${count} câu hỏi`);
        try {
          router.refresh();
        } catch {
          // ignore
        }
      } catch (e) {
        try {
          const fallback = (await (generateTestFromVideo as unknown as (a: number) => Promise<unknown>)(videoId)) as unknown;
          const qs2 = parseQuestions(fallback);
          const count2 = normalizeCount(fallback, qs2);
          if (qs2.length > 0 || count2 > 0) {
            setPreviewQuestions(qs2);
            setResult(typeof fallback === "object" && fallback !== null && !Array.isArray(fallback) ? (fallback as GenerateResult) : { count: count2, questions: qs2 });
            showToast(`Đã tạo ${count2} câu hỏi`);
            router.refresh();
            return;
          }
        } catch {
          // ignore
        }
        setError(e instanceof Error ? e.message : "Tạo test thất bại");
      }
    });
  };

  const handleClear = () => {
    setError(null);
    startClearTransition(async () => {
      try {
        const res = (await clearVideoQuestions(videoId)) as unknown as { deleted?: number };
        const deleted = typeof res?.deleted === "number" ? res.deleted : 0;
        setResult(null);
        setPreviewQuestions([]);
        showToast(deleted > 0 ? `Đã xóa ${deleted} câu` : "Đã xóa preview — nhấn “Tự tạo test từ video” để tạo lại");
      } catch {
        // fallback to local clear if server delete fails (e.g., no DB)
        setResult(null);
        setPreviewQuestions([]);
        showToast("Đã xóa preview — nhấn “Tự tạo test từ video” để tạo lại");
      }
      try {
        router.refresh();
      } catch {
        // ignore
      }
    });
  };
  const handleRegenerate = () => {
    setResult(null);
    setPreviewQuestions([]);
    handleGenerate();
  };

  const displayCount = result ? normalizeCount(result, previewQuestions) : 0;
  const questionsToShow = previewQuestions.length > 0 ? previewQuestions : result ? parseQuestions(result) : [];

  return (
    <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Tự tạo test từ video</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Từ vựng lọc theo level video ±1 · nhiễu thật (không đáp án giả) · {existingCount} câu hiện có · Video #{videoId}
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            Số câu:
            <select
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              disabled={isPending}
              className="rounded-md border border-sakura-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-sakura-400 focus:outline-none"
            >
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} câu
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canGenerate && !result ? (
            <a
              href={`/test/${videoId}`}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 shadow-sm"
            >
              Đã có {existingCount} câu — Làm bài ngay →
            </a>
          ) : !result ? (
            <button
              onClick={handleGenerate}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-md bg-sakura-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isPending && <Spinner className="h-4 w-4 text-white" />}
              {isPending ? "Đang tạo…" : `Tạo ${questionCount} câu`}
            </button>
          ) : (
            <>
              {isAdmin && (
                <button
                  onClick={handleClear}
                  disabled={isClearing || isPending}
                  className="inline-flex items-center gap-2 rounded-md border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-sakura-50 disabled:opacity-50"
                >
                  {isClearing && <Spinner className="h-4 w-4" />}
                  Xóa
                </button>
              )}
              {(isAdmin || previewQuestions.length === 0) && (
                <button
                  onClick={handleRegenerate}
                  disabled={isPending || isClearing}
                  className="inline-flex items-center gap-2 rounded-md bg-sakura-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sakura-600 disabled:opacity-50 shadow-sm"
                >
                  {isPending && <Spinner className="h-4 w-4 text-white" />}
                  {isPending ? "Đang tạo…" : "Tạo lại"}
                </button>
              )}
              {isAdmin && (
                <a
                  href={`/admin/questions?videoId=${videoId}`}
                  className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                >
                  Xem / sửa câu hỏi →
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-sm text-emerald-700">
              Đã tạo <span className="font-bold text-emerald-800">{displayCount}</span> câu hỏi
              {existingCount > 0 && <span className="text-emerald-600"> · trước đó có {existingCount} câu</span>}
            </p>
            <a href={`/video/${videoId}`} className="text-xs font-medium text-sakura-600 hover:text-sakura-700 underline underline-offset-2">
              → Làm bài tại /video/{videoId}
            </a>
          </div>

          {questionsToShow.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Preview (đáp án đã ẩn — bấm Làm bài để thi)</p>
              <ul className="space-y-2">
                {questionsToShow.slice(0, 10).map((q, idx) => {
                  const content = q.content ?? q.question ?? "";
                  const type = q.question_type ?? q.type ?? "—";
                  const opts = parseOptions(q.options);
                  return (
                    <li key={q.id ?? idx} className="rounded-lg border border-sakura-200 bg-white px-3 py-2.5 shadow-sm">
                      <p className="flex gap-2 text-sm text-slate-800">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sakura-500 text-[11px] font-bold text-white">{idx + 1}</span>
                        <span className="flex-1">{content || "(không có nội dung)"}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="rounded border border-sakura-200 bg-sakura-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sakura-700">{type}</span>
                        <span className="text-[11px] text-slate-500">· {opts.length} lựa chọn · đáp án ẩn</span>
                      </div>
                      {opts.length > 0 && <p className="mt-1 text-xs text-slate-500">Lựa chọn: {opts.join(" · ")}</p>}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a href={`/test/${videoId}`} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 shadow-sm">
                  Làm bài ngay →
                </a>
                <a href={`/video/${videoId}`} className="text-xs text-sakura-600 hover:underline">
                  hoặc mở tại /video/{videoId}
                </a>
              </div>
              <p className="text-xs text-slate-500">Đáp án chỉ hiện sau khi nộp bài ở trang thi. Làm mới trang nếu chưa thấy VideoTest.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Không có preview chi tiết — kiểm tra VideoTest ở trang video.</p>
          )}
        </div>
      )}

      {!result && !error && !isPending && (
        <p className="mt-3 text-xs text-slate-500">Sinh VOCAB_CHOICE / FILL_PARTICLE / LISTENING từ nội dung video — câu quá dễ/khó (±1 level) và đáp án giả tự động bị loại.</p>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-md border border-sakura-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
