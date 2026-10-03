"use client";

import { useState } from "react";
import { setReportStatus, type ReportRow } from "@/app/actions/vocabReports";
import { getVocab } from "@/app/actions/manageVocab";
import { parseProperKindFromMeaning } from "@/lib/vocabFilter";
import VocabQuickEdit from "@/components/VocabQuickEdit";

const ISSUE_LABEL: Record<string, string> = {
  READING: "Sai phiên âm",
  MEANING: "Sai nghĩa",
  KIND: "Sai loại từ",
  OTHER: "Khác",
};

type FixState = {
  loading: boolean;
  initial?: { word: string; reading: string; meaning: string; level: string; kind: "proper" | null };
  vocabId?: number | null;
};

function emptyFix(): FixState {
  return { loading: false };
}

export default function ReportsClient({ initial }: { initial: ReportRow[] }) {
  const [reports, setReports] = useState<ReportRow[]>(initial);
  const [fixId, setFixId] = useState<number | null>(null);
  const [fix, setFix] = useState<FixState>(emptyFix());
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  async function openFix(r: ReportRow) {
    setFixId(r.id);
    setFix({ loading: true });
    try {
      if (r.vocab_id) {
        const res = await getVocab(r.vocab_id);
        if (res.ok === true) {
          const v = (res as { vocab: Record<string, unknown> }).vocab;
          setFix({
            loading: false,
            vocabId: Number(v.id),
            initial: {
              word: String(v.word ?? r.word),
              reading: String(v.reading ?? r.reading),
              meaning: String(v.meaning ?? r.current_meaning),
              level: String(v.level ?? "N5"),
              kind: parseProperKindFromMeaning(String(v.meaning ?? "")) ? "proper" : null,
            },
          });
          return;
        }
      }
      setFix({
        loading: false,
        vocabId: null,
        initial: {
          word: r.word,
          reading: r.reading,
          meaning: r.current_meaning,
          level: "N5",
          kind: parseProperKindFromMeaning(r.current_meaning) ? "proper" : null,
        },
      });
    } catch {
      setFix({
        loading: false,
        vocabId: null,
        initial: { word: r.word, reading: r.reading, meaning: r.current_meaning, level: "N5", kind: null },
      });
    }
  }

  async function markStatus(id: number, status: "RESOLVED" | "REJECTED" | "PENDING") {
    const res = await setReportStatus(id, status);
    if (res.ok === true) {
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      showToast(status === "RESOLVED" ? "Đã duyệt ✓" : status === "REJECTED" ? "Đã bỏ qua" : "Đã mở lại");
    } else {
      showToast((res as { error?: string }).error ?? "Thất bại");
    }
  }

  if (reports.length === 0) {
    return <p className="rounded-xl border border-sakura-200 bg-white p-6 text-sm text-slate-500">Không có báo lỗi nào.</p>;
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-slate-900">{r.word}</span>
                {r.reading && <span className="text-sm text-sakura-600">{r.reading}</span>}
                <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  {ISSUE_LABEL[r.issue] ?? r.issue}
                </span>
                {r.status !== "PENDING" && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      r.status === "RESOLVED" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {r.status === "RESOLVED" ? "Đã sửa" : "Đã bỏ qua"}
                  </span>
                )}
              </div>
              {r.current_meaning && (
                <p className="mt-1 text-[13px] text-slate-600">
                  <span className="font-semibold text-slate-500">Nghĩa hiện tại: </span>
                  {r.current_meaning}
                </p>
              )}
              {r.note && <p className="mt-1 text-[13px] text-slate-600">“{r.note}”</p>}
              <p className="mt-1 text-[11px] text-slate-400">
                #{r.id} · {new Date(r.created_at).toLocaleString("vi-VN")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {r.status === "PENDING" && (
                <>
                  <button
                    onClick={() => (fixId === r.id ? (setFixId(null), setFix(emptyFix())) : openFix(r))}
                    className="rounded-full bg-sakura-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sakura-600"
                  >
                    {fixId === r.id ? "Đóng" : "✏️ Sửa từ này"}
                  </button>
                  <button
                    onClick={() => markStatus(r.id, "REJECTED")}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                  >
                    Bỏ qua
                  </button>
                </>
              )}
              {r.status !== "PENDING" && (
                <button
                  onClick={() => markStatus(r.id, "PENDING")}
                  className="rounded-full border border-sakura-300 bg-sakura-50 px-3 py-1.5 text-xs font-medium text-sakura-700 hover:bg-sakura-100"
                >
                  Mở lại
                </button>
              )}
            </div>
          </div>
          {fixId === r.id && (
            <div className="mt-3 rounded-xl border border-sakura-100 bg-sakura-50/50 p-3">
              {fix.loading || !fix.initial ? (
                <p className="text-xs text-slate-500">Đang tải từ vựng…</p>
              ) : (
                <VocabQuickEdit
                  initial={fix.initial}
                  vocabId={fix.vocabId ?? null}
                  onSaved={() => {
                    setFixId(null);
                    setFix(emptyFix());
                    markStatus(r.id, "RESOLVED");
                  }}
                  onCancel={() => {
                    setFixId(null);
                    setFix(emptyFix());
                  }}
                />
              )}
            </div>
          )}
        </div>
      ))}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-md border border-sakura-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
