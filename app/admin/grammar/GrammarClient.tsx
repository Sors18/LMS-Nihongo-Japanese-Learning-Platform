"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createGrammar,
  updateGrammar,
  deleteGrammar,
} from "@/app/actions/manageGrammar";
import Pagination from "@/components/Pagination";

type GrammarRow = {
  id: number;
  structure: string;
  explanation: string;
  level: string;
};

type Props = {
  grammars: GrammarRow[];
  page: number;
  totalPages: number;
  initialQ?: string;
  initialLevel?: string;
};

const LEVELS: Array<"N5" | "N4" | "N3" | "N2" | "N1"> = ["N5", "N4", "N3", "N2", "N1"];
const ALL_LEVELS = ["ALL", ...LEVELS] as const;

export default function GrammarClient({ grammars: initialGrammars, page, totalPages, initialQ = "", initialLevel = "" }: Props) {
  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const pathname = "/admin/grammar";
  const searchParams = useSearchParams() as unknown as URLSearchParams;
  const urlQ = searchParams.get("q") ?? initialQ ?? "";
  const rawLevel = searchParams.get("level") ?? initialLevel ?? "";
  const urlLevel = rawLevel ? rawLevel.toUpperCase() : "ALL";

  const [grammars, setGrammars] = useState<GrammarRow[]>(initialGrammars);
  const [edits, setEdits] = useState<Record<number, { structure: string; explanation: string; level: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Add form state
  const [newStructure, setNewStructure] = useState("");
  const [newExplanation, setNewExplanation] = useState("");
  const [newLevel, setNewLevel] = useState<"N5" | "N4" | "N3" | "N2" | "N1">("N5");

  // Search + filter pills (URL-driven)
  const [search, setSearch] = useState(urlQ);
  const debounceRef = useRef<number | NodeJS.Timeout | null>(null);
  const firstRender = useRef(true);

  const activeLevel = urlLevel || "ALL";

  // Sync if initial props change (server filtering / pagination)
  useEffect(() => {
    setGrammars(initialGrammars);
  }, [initialGrammars]);

  // Sync search when URL changes externally
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== search) {
      setSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  // Debounced push for search
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    clearTimeout(debounceRef.current as unknown as number);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = search.trim();
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
  }, [search]);

  function handleLevelFilter(lv: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (lv === "ALL") params.delete("level");
    else params.set("level", lv);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false } as unknown as never);
  }

  const getEdit = (g: GrammarRow) => {
    const e = edits[g.id];
    if (e) return e;
    return { structure: g.structure, explanation: g.explanation, level: g.level };
  };

  const setEditField = (id: number, field: "structure" | "explanation" | "level", value: string) => {
    setEdits((prev) => {
      const cur = prev[id] ?? (() => {
        const orig = grammars.find((x) => x.id === id);
        return {
          structure: orig?.structure ?? "",
          explanation: orig?.explanation ?? "",
          level: orig?.level ?? "N5",
        };
      })();
      return { ...prev, [id]: { ...cur, [field]: value } };
    });
  };

  const handleCreate = () => {
    const structure = newStructure.trim();
    const explanation = newExplanation.trim();
    const level = newLevel;

    if (!structure) {
      setError("Structure không được để trống");
      return;
    }
    if (!explanation) {
      setError("Explanation không được để trống");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await createGrammar({ structure, explanation, level });
      if (!res.ok) {
        const msg = "error" in res ? String((res as unknown as { error: unknown }).error) : "Tạo thất bại";
        setError(msg);
      } else {
        let created: GrammarRow | null = null;
        if ("grammar" in res) {
          const raw = (res as unknown as { grammar: unknown }).grammar;
          if (raw && typeof raw === "object" && "id" in raw) {
            const maybe = raw as unknown as GrammarRow;
            if (typeof maybe.id === "number" && typeof maybe.structure === "string") {
              created = {
                id: maybe.id,
                structure: String(maybe.structure),
                explanation: String(maybe.explanation ?? explanation),
                level: String(maybe.level ?? level),
              };
            }
          }
        }
        if (created) {
          setGrammars((prev) => [created as GrammarRow, ...prev]);
        } else {
          const maxId = grammars.length ? Math.max(...grammars.map((g) => g.id)) : 0;
          setGrammars((prev) => [{ id: maxId + 1, structure, explanation, level }, ...prev]);
        }
        setSuccess(`Đã thêm ngữ pháp "${structure}"`);
        setNewStructure("");
        setNewExplanation("");
        if (page !== 1) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("page");
          const qs = params.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false } as unknown as never);
        }
      }
    });
  };

  const handleSave = (id: number) => {
    const orig = grammars.find((g) => g.id === id);
    if (!orig) return;
    const edit = getEdit(orig);
    const structure = edit.structure.trim();
    const explanation = edit.explanation.trim();
    const level = edit.level;

    if (!structure) {
      setError("Structure không được để trống");
      return;
    }
    if (!explanation) {
      setError("Explanation không được để trống");
      return;
    }
    if (!LEVELS.includes(level as typeof LEVELS[number])) {
      setError("Level không hợp lệ");
      return;
    }

    const isDirty = structure !== orig.structure || explanation !== orig.explanation || level !== orig.level;
    if (!isDirty) {
      setError("Không có thay đổi để lưu");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await updateGrammar(id, { structure, explanation, level });
      if (!res.ok) {
        const msg = "error" in res ? String((res as unknown as { error: unknown }).error) : "Cập nhật thất bại";
        setError(msg);
      } else {
        let updatedRow: GrammarRow | null = null;
        if ("grammar" in res) {
          const raw = (res as unknown as { grammar: unknown }).grammar;
          if (raw && typeof raw === "object" && "id" in raw) {
            const maybe = raw as unknown as GrammarRow;
            if (typeof maybe.id === "number") {
              updatedRow = {
                id: maybe.id,
                structure: String(maybe.structure ?? structure),
                explanation: String(maybe.explanation ?? explanation),
                level: String(maybe.level ?? level),
              };
            }
          }
        }
        if (updatedRow) {
          setGrammars((prev) => prev.map((x) => (x.id === id ? updatedRow as GrammarRow : x)));
        } else {
          setGrammars((prev) => prev.map((x) => (x.id === id ? { ...x, structure, explanation, level } : x)));
        }
        setSuccess(`Đã cập nhật #${id}`);
        setEdits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    });
  };

  const handleDelete = (id: number) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteGrammar(id);
      if (!res.ok) {
        const msg = "error" in res ? String((res as unknown as { error: unknown }).error) : "Xóa thất bại";
        setError(msg);
      } else {
        setSuccess(`Đã xóa ngữ pháp #${id}`);
        setGrammars((prev) => prev.filter((x) => x.id !== id));
        setDeleteConfirm(null);
        setEdits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    });
  };

  const hasActiveFilter = Boolean(urlQ.trim() || (activeLevel !== "ALL" && activeLevel !== ""));

  if (grammars.length === 0 && !hasActiveFilter) {
    return (
      <div className="space-y-4">
        {/* Add form even when empty */}
        <div className="rounded-xl border border-sakura-200 bg-white p-5 space-y-3 shadow-sm">
          <h3 className="font-semibold text-slate-800">Thêm ngữ pháp</h3>
          <div className="grid gap-3 md:grid-cols-[1.2fr_2fr_140px_100px]">
            <input
              value={newStructure}
              onChange={(e) => setNewStructure(e.target.value)}
              placeholder="Structure (vd: 〜たことがある)"
              className="rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
            <input
              value={newExplanation}
              onChange={(e) => setNewExplanation(e.target.value)}
              placeholder="Explanation (vd: Đã từng làm gì...)"
              className="rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
            />
            <select
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value as typeof newLevel)}
              className="rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
            >
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="rounded-lg bg-sakura-500 px-4 py-2 text-sm font-bold text-white hover:bg-sakura-600 disabled:opacity-50 shadow-sm"
            >
              {isPending ? "Đang thêm..." : "Thêm"}
            </button>
          </div>
          {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}
          {success && <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">{success}</p>}
        </div>

        <div className="rounded-xl border border-sakura-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-400">Chưa có ngữ pháp nào.</p>
          <p className="mt-1 text-xs text-slate-400">Dùng form trên để thêm mẫu đầu tiên, hoặc kiểm tra DB seed.</p>
          <div className="mt-4 flex justify-center gap-2">
            <a href="/admin/vocab" className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-sakura-50">
              Quản lý Vocab
            </a>
            <a href="/" className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-sakura-50">
              Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">{success}</p>}

      {/* Add form */}
      <div className="rounded-xl border border-sakura-200 bg-white p-5 space-y-3 shadow-sm">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-sakura-500" /> Thêm ngữ pháp
        </h3>
        <div className="grid gap-3 md:grid-cols-[1.2fr_2fr_140px_100px]">
          <input
            value={newStructure}
            onChange={(e) => setNewStructure(e.target.value)}
            placeholder="Structure (vd: 〜たことがある)"
            className="rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
          />
          <input
            value={newExplanation}
            onChange={(e) => setNewExplanation(e.target.value)}
            placeholder="Explanation (vd: Đã từng làm gì...)"
            className="rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
          />
          <select
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value as typeof newLevel)}
            className="rounded-lg border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
          >
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={isPending}
            className="rounded-lg bg-sakura-500 px-4 py-2 text-sm font-bold text-white hover:bg-sakura-600 disabled:opacity-50 shadow-sm"
          >
            {isPending ? "Đang thêm..." : "Thêm"}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Gọi <code>createGrammar</code> — validate structure/explanation không rỗng, level N5..N1, check dup, <code>requireAdmin</code>.
        </p>
      </div>

      {/* Search + filter pills (URL-driven) */}
      <div className="rounded-xl border border-sakura-200 bg-white p-4 space-y-3 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm structure / explanation…"
              className="w-full rounded-full border border-sakura-200 bg-sakura-50 px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-300 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="text-xs text-slate-500">
            Hiển thị {grammars.length} • Trang {page}/{totalPages}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_LEVELS.map((lv) => {
            const active = activeLevel === lv || (lv === "ALL" && (activeLevel === "" || activeLevel === "ALL"));
            return (
              <button
                key={lv}
                onClick={() => handleLevelFilter(lv)}
                className={
                  active
                    ? "rounded-full bg-sakura-500 px-3 py-1 text-xs font-bold text-white shadow-sm"
                    : "rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-sakura-50"
                }
              >
                {lv === "ALL" ? "Tất cả" : lv}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-sakura-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-sakura-50 text-xs text-sakura-700">
            <tr>
              <th className="px-3 py-2 w-[60px]">ID</th>
              <th className="px-3 py-2 min-w-[180px]">Structure</th>
              <th className="px-3 py-2 min-w-[260px]">Explanation</th>
              <th className="px-3 py-2 w-[110px]">Level</th>
              <th className="px-3 py-2 text-right w-[160px]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sakura-100 bg-white">
            {grammars.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  Không tìm thấy kết quả. Thử từ khóa khác hoặc chọn level khác.
                </td>
              </tr>
            ) : (
              grammars.map((g) => {
                const edit = getEdit(g);
                const isDirty =
                  edit.structure.trim() !== g.structure ||
                  edit.explanation.trim() !== g.explanation ||
                  edit.level !== g.level;
                return (
                  <tr key={g.id} className="hover:bg-sakura-50/50">
                    <td className="px-3 py-2 font-mono text-xs text-sakura-700">#{g.id}</td>
                    <td className="px-3 py-2">
                      <input
                        value={edit.structure}
                        onChange={(e) => setEditField(g.id, "structure", e.target.value)}
                        className="w-full rounded-lg border border-sakura-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
                        placeholder="Structure"
                      />
                      <p className="mt-1 text-[11px] text-slate-400 truncate max-w-[240px]" title={g.structure}>
                        Gốc: {g.structure}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={edit.explanation}
                        onChange={(e) => setEditField(g.id, "explanation", e.target.value)}
                        className="w-full rounded-lg border border-sakura-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-sakura-300 focus:outline-none"
                        placeholder="Explanation"
                      />
                      <p className="mt-1 max-w-[380px] truncate text-[11px] text-slate-400" title={g.explanation}>
                        {g.explanation}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold text-sakura-700">
                        {g.level}
                      </span>
                      <div className="mt-2">
                        <select
                          value={edit.level}
                          onChange={(e) => setEditField(g.id, "level", e.target.value)}
                          className="w-full rounded-lg border border-sakura-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-sakura-300 focus:outline-none"
                        >
                          {LEVELS.map((lv) => (
                            <option key={lv} value={lv}>
                              {lv}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1.5 items-center">
                        <button
                          onClick={() => handleSave(g.id)}
                          disabled={isPending || !isDirty}
                          className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 shadow-sm"
                        >
                          {isPending ? "Đang lưu..." : "Lưu"}
                        </button>
                        {deleteConfirm === g.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(g.id)}
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
                            onClick={() => setDeleteConfirm(g.id)}
                            className="rounded-full border-2 border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalPages={totalPages} />

      <p className="text-xs text-slate-400">
        Trang {page}/{totalPages} • Hiển thị {grammars.length} trên trang này • RevalidatePath <code>/admin/grammar</code> sau mỗi thay đổi.
      </p>
    </div>
  );
}
