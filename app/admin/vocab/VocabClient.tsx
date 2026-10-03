"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createVocab, updateVocab, deleteVocab } from "@/app/actions/manageVocab";
import Pagination from "@/components/Pagination";

type VocabRow = {
  id: number;
  word: string;
  reading: string;
  meaning: string;
  level: string;
};

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

export default function VocabClient({
  vocabularies: initialVocabularies,
  page,
  totalPages,
  initialQ = "",
  initialLevel = "",
}: {
  vocabularies: VocabRow[];
  page: number;
  totalPages: number;
  initialQ?: string;
  initialLevel?: string;
}) {
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const pathname = "/admin/vocab";
  const searchParams = useSearchParams() as unknown as URLSearchParams;

  const urlQ = searchParams.get("q") ?? initialQ ?? "";
  const urlLevel = searchParams.get("level") ?? initialLevel ?? "";

  const [vocabs, setVocabs] = useState<VocabRow[]>(initialVocabularies);
  const [edits, setEdits] = useState<Record<number, { word: string; reading: string; meaning: string; level: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Add form
  const [newWord, setNewWord] = useState("");
  const [newReading, setNewReading] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [newLevel, setNewLevel] = useState<string>("N5");

  // Search + level pills (URL-driven, server pagination)
  const [query, setQuery] = useState(urlQ);
  const debounceRef = useRef<number | NodeJS.Timeout | null>(null);
  const firstRender = useRef(true);

  const activeLevel = urlLevel || null;

  // Sync vocabs when server data changes (pagination / filter)
  useEffect(() => {
    setVocabs(initialVocabularies);
  }, [initialVocabularies]);

  // Sync query when URL changes externally (back/forward)
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== query) {
      setQuery(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  // Debounced push for search input
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    clearTimeout(debounceRef.current as unknown as number);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = query.trim();
      if (!trimmed) params.delete("q");
      else params.set("q", trimmed);
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false } as unknown as never);
    }, 400);
    return () => {
      clearTimeout(debounceRef.current as unknown as number);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleLevelClick(lv: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!lv) params.delete("level");
    else params.set("level", lv);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false } as unknown as never);
  }

  function clearFilters() {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("level");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false } as unknown as never);
  }

  const getEdit = (v: VocabRow) => {
    const e = edits[v.id];
    if (e) return e;
    return { word: v.word, reading: v.reading, meaning: v.meaning, level: v.level };
  };

  const setEditField = (vocabId: number, field: "word" | "reading" | "meaning" | "level", value: string) => {
    setEdits((prev) => {
      const cur =
        prev[vocabId] ??
        (() => {
          const orig = vocabs.find((x) => x.id === vocabId);
          return {
            word: orig?.word ?? "",
            reading: orig?.reading ?? "",
            meaning: orig?.meaning ?? "",
            level: orig?.level ?? "N5",
          };
        })();
      return { ...prev, [vocabId]: { ...cur, [field]: value } };
    });
  };

  const handleCreate = () => {
    const w = newWord.trim();
    const r = newReading.trim();
    const m = newMeaning.trim();
    const lv = newLevel;

    if (!w) {
      setError("Từ (word) không được để trống");
      return;
    }
    if (!m) {
      setError("Nghĩa (meaning) không được để trống");
      return;
    }
    if (!LEVELS.includes(lv as never)) {
      setError("Level không hợp lệ");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await createVocab({ word: w, reading: r, meaning: m, level: lv });
      if (!res.ok) {
        let msg = "Thêm thất bại";
        if (res && typeof res === "object" && "error" in res) {
          const e = (res as unknown as { error: unknown }).error;
          if (typeof e === "string" && e) msg = e;
          else if (e != null) msg = String(e);
        }
        setError(msg);
      } else {
        let created: VocabRow | null = null;
        if (res && typeof res === "object" && "vocab" in res) {
          const raw = (res as unknown as { vocab: unknown }).vocab;
          if (raw && typeof raw === "object" && "id" in raw) {
            const maybe = raw as unknown as VocabRow;
            if (typeof maybe.id === "number" && typeof maybe.word === "string") {
              created = {
                id: maybe.id,
                word: String(maybe.word),
                reading: String(maybe.reading ?? r),
                meaning: String(maybe.meaning ?? m),
                level: String(maybe.level ?? lv),
              };
            }
          }
        }
        const finalCreated = created ?? {
          id: Date.now(),
          word: w,
          reading: r,
          meaning: m,
          level: lv,
        };
        setSuccess(`Đã thêm từ vựng "${finalCreated.word}" (#${finalCreated.id})`);
        setVocabs((prev) => [finalCreated as VocabRow, ...prev]);
        setNewWord("");
        setNewReading("");
        setNewMeaning("");
        setNewLevel("N5");
        // If not on first page, navigate to first page to see new item (optional)
        if (page !== 1) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("page");
          const qs = params.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false } as unknown as never);
        }
      }
    });
  };

  const handleSave = (vocabId: number) => {
    const orig = vocabs.find((x) => x.id === vocabId);
    if (!orig) return;
    const edit = getEdit(orig);
    const wordChanged = edit.word.trim() !== orig.word;
    const readingChanged = edit.reading.trim() !== orig.reading;
    const meaningChanged = edit.meaning.trim() !== orig.meaning;
    const levelChanged = edit.level !== orig.level;

    if (!wordChanged && !readingChanged && !meaningChanged && !levelChanged) {
      setError("Không có thay đổi để lưu");
      return;
    }
    if (!edit.word.trim()) {
      setError("Từ (word) không được để trống");
      return;
    }
    if (!edit.meaning.trim()) {
      setError("Nghĩa (meaning) không được để trống");
      return;
    }
    if (!LEVELS.includes(edit.level as never)) {
      setError("Level không hợp lệ");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await updateVocab(vocabId, {
        word: edit.word.trim(),
        reading: edit.reading.trim(),
        meaning: edit.meaning.trim(),
        level: edit.level,
      });
      if (!res.ok) {
        let msg = "Cập nhật thất bại";
        if (res && typeof res === "object" && "error" in res) {
          const e = (res as unknown as { error: unknown }).error;
          if (typeof e === "string" && e) msg = e;
          else if (e != null) msg = String(e);
        }
        setError(msg);
      } else {
        let updated: VocabRow | null = null;
        if (res && typeof res === "object" && "vocab" in res) {
          const raw = (res as unknown as { vocab: unknown }).vocab;
          if (raw && typeof raw === "object" && "id" in raw) {
            const maybe = raw as unknown as VocabRow;
            if (typeof maybe.id === "number") {
              updated = {
                id: maybe.id,
                word: String(maybe.word ?? edit.word.trim()),
                reading: String(maybe.reading ?? edit.reading.trim()),
                meaning: String(maybe.meaning ?? edit.meaning.trim()),
                level: String(maybe.level ?? edit.level),
              };
            }
          }
        }
        const final = updated ?? {
          id: vocabId,
          word: edit.word.trim(),
          reading: edit.reading.trim(),
          meaning: edit.meaning.trim(),
          level: edit.level,
        };
        setSuccess(`Đã cập nhật #${vocabId} "${final.word}"`);
        setVocabs((prev) => prev.map((x) => (x.id === vocabId ? (final as VocabRow) : x)));
        setEdits((prev) => {
          const next = { ...prev };
          delete next[vocabId];
          return next;
        });
      }
    });
  };

  const handleDelete = (vocabId: number) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteVocab(vocabId);
      if (!res.ok) {
        let msg = "Xóa thất bại";
        if (res && typeof res === "object" && "error" in res) {
          const e = (res as unknown as { error: unknown }).error;
          if (typeof e === "string" && e) msg = e;
          else if (e != null) msg = String(e);
        }
        setError(msg);
      } else {
        setSuccess(`Đã xóa từ vựng #${vocabId}`);
        setVocabs((prev) => prev.filter((x) => x.id !== vocabId));
        setDeleteConfirm(null);
        setEdits((prev) => {
          const next = { ...prev };
          delete next[vocabId];
          return next;
        });
      }
    });
  };

  const hasActiveFilter = Boolean(urlQ.trim() || activeLevel);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">{success}</p>}

      {/* Form Thêm từ vựng */}
      <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Thêm từ vựng</h3>
        <p className="mt-1 text-xs text-slate-500">Nhập word / reading / meaning / level rồi bấm Thêm (gọi createVocab, requireAdmin).</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="text-xs font-medium text-slate-600">Từ (word) *</label>
            <input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="例: 食べる"
              className="mt-1 w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Reading</label>
            <input
              value={newReading}
              onChange={(e) => setNewReading(e.target.value)}
              placeholder="たべる"
              className="mt-1 w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600">Nghĩa (meaning) *</label>
            <input
              value={newMeaning}
              onChange={(e) => setNewMeaning(e.target.value)}
              placeholder="ăn"
              className="mt-1 w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600">Level</label>
              <select
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
              >
                <option value="N5">N5</option>
                <option value="N4">N4</option>
                <option value="N3">N3</option>
                <option value="N2">N2</option>
                <option value="N1">N1</option>
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="rounded-full bg-sakura-500 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-sakura-600 disabled:opacity-50 whitespace-nowrap"
            >
              {isPending ? "Đang thêm..." : "Thêm"}
            </button>
          </div>
        </div>
      </div>

      {/* Ô tìm kiếm + filter level pills (URL-driven) */}
      <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[220px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm word / reading / meaning..."
              className="w-full rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
          </div>
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Lọc level:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleLevelClick(null)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                !activeLevel
                  ? "bg-sakura-500 text-white border-sakura-500 shadow-sm"
                  : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
              }`}
            >
              Tất cả
            </button>
            {LEVELS.map((lv) => {
              const isActive = activeLevel === lv;
              return (
                <button
                  key={lv}
                  onClick={() => handleLevelClick(isActive ? null : lv)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide transition-colors ${
                    isActive
                      ? "bg-sakura-600 border-sakura-600 text-white shadow-sm"
                      : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
                  }`}
                >
                  {lv}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Hiển thị {vocabs.length} từ · Trang {page} / {totalPages} · Tìm kiếm và lọc theo URL (server pagination)
        </p>
      </div>

      {/* Bảng sakura */}
      {vocabs.length === 0 ? (
        <div className="rounded-xl border border-sakura-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-400">
            {hasActiveFilter ? "Không tìm thấy từ vựng nào khớp bộ lọc." : "Chưa có từ vựng nào. Dùng form trên để thêm."}
          </p>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="mt-3 rounded-lg border border-sakura-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-sakura-50"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-sakura-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-sakura-50 text-xs text-sakura-700">
                <tr>
                  <th className="px-3 py-2 whitespace-nowrap">ID</th>
                  <th className="px-3 py-2">Từ (word)</th>
                  <th className="px-3 py-2">Reading</th>
                  <th className="px-3 py-2">Nghĩa (meaning)</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sakura-100 bg-white">
                {vocabs.map((v) => {
                  const edit = getEdit(v);
                  const isDirty =
                    edit.word.trim() !== v.word ||
                    edit.reading.trim() !== v.reading ||
                    edit.meaning.trim() !== v.meaning ||
                    edit.level !== v.level;
                  return (
                    <tr key={v.id} className="hover:bg-sakura-50/50">
                      <td className="px-3 py-2 font-mono text-xs text-sakura-700 whitespace-nowrap">#{v.id}</td>
                      <td className="px-3 py-2">
                        <input
                          value={edit.word}
                          onChange={(e) => setEditField(v.id, "word", e.target.value)}
                          className="w-full min-w-[120px] rounded-lg border border-sakura-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
                          placeholder="word"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={edit.reading}
                          onChange={(e) => setEditField(v.id, "reading", e.target.value)}
                          className="w-full min-w-[110px] rounded-lg border border-sakura-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
                          placeholder="reading"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={edit.meaning}
                          onChange={(e) => setEditField(v.id, "meaning", e.target.value)}
                          className="w-full min-w-[160px] rounded-lg border border-sakura-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
                          placeholder="meaning"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="hidden sm:inline rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold text-sakura-700">
                          {v.level}
                        </span>
                        <div className="mt-1 sm:mt-2">
                          <select
                            value={edit.level}
                            onChange={(e) => setEditField(v.id, "level", e.target.value)}
                            className="rounded-lg border border-sakura-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-sakura-300 focus:outline-none"
                          >
                            <option value="N5">N5</option>
                            <option value="N4">N4</option>
                            <option value="N3">N3</option>
                            <option value="N2">N2</option>
                            <option value="N1">N1</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5 items-center">
                          <button
                            onClick={() => handleSave(v.id)}
                            disabled={isPending || !isDirty}
                            className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 shadow-sm"
                          >
                            {isPending ? "Đang lưu..." : "Lưu"}
                          </button>
                          {deleteConfirm === v.id ? (
                            <>
                              <button
                                onClick={() => handleDelete(v.id)}
                                disabled={isPending}
                                className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
                              >
                                Xác nhận?
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-sakura-50"
                              >
                                Hủy
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(v.id)}
                              className="rounded-full border-2 border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination currentPage={page} totalPages={totalPages} />
        </>
      )}

      <p className="text-xs text-slate-400">
        Trang {page}/{totalPages} · Hiển thị {vocabs.length} từ trên trang này · Chỉ ADMIN mới truy cập được (middleware đã chặn). Thao tác gọi Server Actions
        (<code>createVocab / updateVocab / deleteVocab</code>) — mỗi action check <code>requireAdmin</code> và <code>revalidatePath /admin/vocab</code>.
      </p>
    </div>
  );
}
