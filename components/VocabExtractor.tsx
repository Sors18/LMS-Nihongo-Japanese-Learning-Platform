"use client";

import { useState, useTransition, Fragment } from "react";
import { extractVocabFromVideo } from "@/app/actions/extractVocab";
import { createFlashcard } from "@/app/actions/flashcard";
import { normalizeMeaningVi, formatReading } from "@/lib/meaningVi";
import ExtractionProgressModal, { useExtractionJob } from "./ExtractionProgress";
import TablePager, { getPageCount, clampPage, paginateList } from "./TablePager";
import VocabQuickEdit from "./VocabQuickEdit";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types — khớp contract Slice V: {word, reading, pos, basic_form, freq, vocabId?, meaning?, level?}
// ---------------------------------------------------------------------------
type VocabItem = {
  word: string;
  reading: string;
  pos: string;
  basic_form: string;
  freq: number;
  vocabId?: number | null;
  meaning?: string | null;
  level?: string | null;
  /** loại tên riêng (person/place/org/proper) — null nếu là từ vựng thường */
  isProper?: string | null;
};

type Props = {
  videoId: number;
  subtitles?: string[];
  /** ADMIN thấy nút Sửa nhanh từng dòng */
  isAdmin?: boolean;
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "h-4 w-4"}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function VocabExtractor({ videoId, subtitles: _subtitles, isAdmin = false }: Props) {
  // _subtitles kept for prop contract (subtitles?: string[]) — server extracts via subtitles table, not prop
  void _subtitles;
  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"all" | "vocab" | "names">("all");
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const { progress, run: runJob, cancel: cancelJob } = useExtractionJob();
  const extracting = isPending || progress !== null;

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleExtract = () => {
    setError(null);
    startTransition(async () => {
      const applyResult = (res: unknown) => {
        if (!Array.isArray(res)) {
          setError("Kết quả không hợp lệ");
          return;
        }
        // Normalize: ensure required fields have fallback
        const normalized: VocabItem[] = (res as unknown[]).map((r) => ({
          word: String((r as unknown as Record<string, unknown>).word ?? ""),
          reading: String((r as unknown as Record<string, unknown>).reading ?? (r as unknown as Record<string, unknown>).word ?? ""),
          pos: String((r as unknown as Record<string, unknown>).pos ?? ""),
          basic_form: String((r as unknown as Record<string, unknown>).basic_form ?? (r as unknown as Record<string, unknown>).word ?? ""),
          freq: Number((r as unknown as Record<string, unknown>).freq ?? 1),
          vocabId: (r as unknown as Record<string, unknown>).vocabId as number | null | undefined,
          meaning: (r as unknown as Record<string, unknown>).meaning as string | null | undefined,
          level: (r as unknown as Record<string, unknown>).level as string | null | undefined,
          isProper: (r as unknown as Record<string, unknown>).isProper as string | null | undefined,
        }));
        setVocabList(normalized);
        setTab("all");
        setPage(1);
        if (normalized.length === 0) showToast("Không tìm thấy từ vựng mới");
        else showToast(`Đã trích xuất ${normalized.length} từ`);
      };
      try {
        // SSE: popup % tiến trình; lỗi stream → fallback gọi action trực tiếp
        const res = await runJob("/api/extract/vocab", { videoId }, "Trích xuất từ vựng");
        applyResult(res);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        try {
          applyResult(await extractVocabFromVideo(videoId));
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : "Trích xuất thất bại");
        }
      }
    });
  };

  const keyOf = (v: VocabItem) => `${v.word}__${v.reading}`;

  const handleSaveOne = async (v: VocabItem) => {
    const k = keyOf(v);
    if (savedKeys.has(k)) {
      showToast(`"${v.word}" đã lưu rồi`);
      return;
    }
    setSavingKey(k);
    try {
      const res = await createFlashcard({
        word: v.word,
        reading: v.reading,
        meaning: v.meaning ?? undefined,
        level: v.level ?? undefined,
        video_context_id: videoId,
      });
      if ((res as unknown as Record<string, unknown>).ok === false) {
        const err = (res as unknown as Record<string, unknown>).error as string | undefined;
        showToast(err ?? "Lưu thất bại");
      } else {
        setSavedKeys((prev) => new Set(prev).add(k));
        const existed = (res as unknown as Record<string, unknown>).existed;
        showToast(existed ? `Đã có "${v.word}" trong flashcard` : `Đã lưu "${v.word}"`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveAll = async () => {
    if (vocabList.length === 0) return;
    setBulkSaving(true);
    let okCount = 0;
    let existedCount = 0;
    for (const v of vocabList) {
      const k = keyOf(v);
      if (savedKeys.has(k)) {
        existedCount++;
        continue;
      }
      try {
        const res = await createFlashcard({
          word: v.word,
          reading: v.reading,
          meaning: v.meaning ?? undefined,
          level: v.level ?? undefined,
          video_context_id: videoId,
        });
        if ((res as unknown as Record<string, unknown>).ok !== false) {
          okCount++;
          const existed = (res as unknown as Record<string, unknown>).existed;
          if (existed) existedCount++;
          setSavedKeys((prev) => new Set(prev).add(k));
        }
      } catch {
        // continue to next
      }
    }
    setBulkSaving(false);
    showToast(`Đã lưu ${okCount} từ${existedCount ? ` (${existedCount} đã tồn tại)` : ""}`);
  };

  const nameCount = vocabList.filter((v) => !!v.isProper).length;
  const visibleList =
    tab === "names" ? vocabList.filter((v) => !!v.isProper) : tab === "vocab" ? vocabList.filter((v) => !v.isProper) : vocabList;
  const totalPages = getPageCount(visibleList.length, PAGE_SIZE);
  const safePage = clampPage(page, totalPages);
  const pagedList = paginateList(visibleList, safePage, PAGE_SIZE);

  function handleTabChange(t: "all" | "vocab" | "names") {
    setTab(t);
    setPage(1);
  }

  return (
    <div className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Từ vựng từ video</h3>
          <p className="mt-0.5 text-xs text-slate-500">Trích xuất bằng kuromoji từ phụ đề · Video #{videoId}</p>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md border border-sakura-200 bg-white px-3 py-2 text-sm font-semibold text-sakura-700 hover:bg-sakura-50"
        >
          {collapsed ? "Mở rộng" : "Thu gọn"}
        </button>
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="inline-flex items-center gap-2 rounded-md bg-sakura-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {extracting && <Spinner className="h-4 w-4 text-white" />}
          {extracting ? "Đang trích xuất…" : "Trích xuất từ vựng"}
        </button>
      </div>

      {!collapsed && (
        <>
      {error && <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {vocabList.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Tìm thấy <span className="font-semibold text-slate-800">{vocabList.length}</span> từ
              {nameCount > 0 && (
                <span className="ml-1 text-slate-400">· {nameCount} tên riêng</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {nameCount > 0 && (
                <div className="flex rounded-full border border-sakura-200 bg-white p-0.5 text-[11px] font-bold">
                   {([["all", "Tất cả"], ["vocab", "Từ vựng"], ["names", `Tên riêng (${nameCount})`]] as const).map(([k, label]) => (
                     <button
                       key={k}
                       onClick={() => handleTabChange(k)}
                       className={`rounded-full px-2.5 py-1 transition ${tab === k ? "bg-sakura-500 text-white shadow-sm" : "text-slate-500 hover:text-sakura-700"}`}
                     >
                       {label}
                     </button>
                   ))}
                </div>
              )}
              <button
                onClick={handleSaveAll}
                disabled={bulkSaving || isPending}
                className="inline-flex items-center gap-2 rounded-md bg-sakura-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sakura-600 disabled:opacity-50"
              >
                {bulkSaving && <Spinner className="h-3.5 w-3.5" />}
                {bulkSaving ? "Đang lưu…" : "Lưu tất cả"}
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-sakura-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-sakura-50 text-xs uppercase tracking-wide text-sakura-700">
                <tr>
                  <th className="px-3 py-2 font-medium">Từ</th>
                  <th className="px-3 py-2 font-medium">Reading</th>
                  <th className="px-3 py-2 font-medium">POS</th>
                  <th className="px-3 py-2 font-medium">Nghĩa</th>
                  <th className="px-3 py-2 font-medium text-center">Freq</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium text-right">Lưu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sakura-100">
                {pagedList.map((v, idx) => {
                  const k = keyOf(v);
                  const isSaved = savedKeys.has(k);
                  const isSaving = savingKey === k;
                  const isEditing = editingKey === k;
                  return (
                    <Fragment key={`${k}__${idx}`}>
                    <tr className="bg-white hover:bg-sakura-50/50">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {v.word}
                        {v.isProper && (
                          <span className="ml-1.5 inline-block rounded-full bg-violet-100 border border-violet-200 px-1.5 py-px text-[10px] font-bold text-violet-700">
                            Tên riêng
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-sakura-600">{formatReading(v.word, v.reading)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{v.pos || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 max-w-[18rem] truncate" title={v.meaning ? normalizeMeaningVi(v.meaning, v.word) : ""}>
                        {v.meaning ? normalizeMeaningVi(v.meaning, v.word) : <span className="text-slate-400">Chưa có nghĩa</span>}
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-slate-600">{v.freq}</td>
                      <td className="px-3 py-2">
                        {v.level ? (
                          <span className="inline-block rounded border border-sakura-200 bg-sakura-100 px-1.5 py-0.5 text-[11px] font-medium text-sakura-700">{v.level}</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                        {isAdmin && !isEditing && (
                          <button
                            onClick={() => setEditingKey(k)}
                            title="Sửa từ vựng trong DB (chỉ ADMIN)"
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            ✏️ Sửa
                          </button>
                        )}
                        <button
                          onClick={() => handleSaveOne(v)}
                          disabled={isSaving || isSaved}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${
                            isSaved
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default"
                              : "border-sakura-300 bg-sakura-50 text-sakura-700 hover:bg-sakura-100 disabled:opacity-50"
                          }`}
                        >
                          {isSaving && <Spinner className="h-3 w-3" />}
                          {isSaved ? "Đã lưu" : isSaving ? "Đang lưu…" : "Lưu"}
                        </button>
                        </div>
                      </td>
                    </tr>
                    {isEditing && isAdmin && (
                      <tr key={`${k}__${idx}__edit`}>
                        <td colSpan={7} className="bg-amber-50/60 px-3 py-3">
                          <VocabQuickEdit
                            initial={{
                              word: v.word,
                              reading: formatReading(v.word, v.reading),
                              meaning: v.meaning ?? "",
                              level: v.level ?? "",
                              kind: v.isProper ? "proper" : null,
                            }}
                            vocabId={v.vocabId ?? null}
                            onSaved={(saved) => {
                              setVocabList((prev) =>
                                prev.map((it) =>
                                  keyOf(it) === k
                                    ? { ...it, word: saved.word, reading: saved.reading, meaning: saved.meaning, level: saved.level, vocabId: saved.vocabId || it.vocabId, isProper: saved.kind }
                                    : it
                                )
                              );
                              setEditingKey(null);
                              showToast(`Đã sửa "${saved.word}" ✓`);
                            }}
                            onCancel={() => setEditingKey(null)}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, visibleList.length)} trong {visibleList.length} từ
            </p>
          )}
          <TablePager page={safePage} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      {vocabList.length === 0 && !extracting && !error && (
        <p className="mt-3 text-xs text-slate-500">Nhấn &ldquo;Trích xuất từ vựng&rdquo; để tách từ từ phụ đề bằng kuromoji.</p>
      )}

        </>
      )}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-md border border-sakura-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
      <ExtractionProgressModal job={progress} onCancel={cancelJob} />
    </div>
  );
}
