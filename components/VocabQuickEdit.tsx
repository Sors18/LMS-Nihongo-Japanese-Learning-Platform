"use client";

import { useState } from "react";
import { updateVocab, createVocab } from "@/app/actions/manageVocab";
import { buildProperNounMeaning } from "@/lib/vocabFilter";
import { buildKnownProperMeaning } from "@/lib/properNames";
import type { ProperNounKind } from "@/lib/vocabFilter";

export type QuickEditInitial = {
  word: string;
  reading: string;
  meaning: string;
  level: string;
  /** loại từ hiện tại (null/""/undefined = từ vựng thường) — để dựng dropdown */
  kind?: ProperNounKind | "" | null;
};

export type QuickEditSaved = QuickEditInitial & { vocabId: number; kind: ProperNounKind | null };

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

const KIND_OPTIONS: Array<{ value: "" | "proper"; label: string }> = [
  { value: "", label: "Từ vựng thường" },
  { value: "proper", label: "Tên riêng" },
];

/** Nghĩa chuẩn gợi ý khi chọn tên riêng (ưu tiên map đã biết: romaji + tác phẩm). */
function suggestProperMeaning(word: string): string {
  return buildKnownProperMeaning(word) ?? buildProperNounMeaning(word, "proper");
}

/**
 * Form sửa nhanh từ vựng cho ADMIN — dùng chung cho tooltip hover và list trích xuất.
 * - Có vocabId → updateVocab (ghi đè DB, bust cache server để hover sau hiện đúng ngay).
 * - Chưa có vocabId (nghĩa cố định tổng hợp, VD tên riêng) → createVocab rồi dùng id mới.
 */
export default function VocabQuickEdit({
  initial,
  vocabId,
  onSaved,
  onCancel,
}: {
  initial: QuickEditInitial;
  vocabId: number | null;
  onSaved: (saved: QuickEditSaved) => void;
  onCancel: () => void;
}) {
  const [word, setWord] = useState(initial.word);
  const [reading, setReading] = useState(initial.reading);
  const [meaning, setMeaning] = useState(initial.meaning);
  const [level, setLevel] = useState(
    (LEVELS as readonly string[]).includes(initial.level) ? initial.level : "N5"
  );
  const [kind, setKind] = useState<"" | "proper">(initial.kind ? "proper" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Đổi loại từ → tự điền nghĩa chuẩn (sửa tay tiếp được). Về "từ vựng" thì xóa nghĩa "Tên …" cũ. */
  function handleKindChange(next: "" | "proper") {
    setKind(next);
    if (next) {
      setMeaning(suggestProperMeaning(word.trim() || initial.word));
    } else if (meaning.trim().startsWith("Tên ")) {
      setMeaning("");
    }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        word: word.trim(),
        reading: reading.trim(),
        meaning: meaning.trim(),
        level,
      };
      if (vocabId) {
        const res = await updateVocab(vocabId, payload);
        if ((res as { ok?: boolean }).ok === true) {
          onSaved({ ...payload, kind: kind || null, vocabId });
          return;
        }
        setError((res as { error?: string }).error ?? "Lưu thất bại");
      } else {
        const res = await createVocab(payload);
        if ((res as { ok?: boolean }).ok === true) {
          const created = (res as { vocab?: { id?: number } }).vocab;
          onSaved({ ...payload, kind: kind || null, vocabId: Number(created?.id ?? 0) || 0 });
          return;
        }
        setError((res as { error?: string }).error ?? "Lưu thất bại");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-sakura-200 bg-white px-2 py-1 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-sakura-300";

  return (
    <div className="space-y-2" data-testid="vocab-quick-edit">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Từ</span>
          <input value={word} onChange={(e) => setWord(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Phiên âm</span>
          <input value={reading} onChange={(e) => setReading(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-500">Nghĩa (tiếng Việt)</span>
        <textarea
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Loại từ</span>
          <select value={kind} onChange={(e) => handleKindChange(e.target.value as "" | "proper")} className={inputCls}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value || "vocab"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-sakura-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sakura-600 disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : vocabId ? "Lưu sửa" : "Tạo từ mới"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}
