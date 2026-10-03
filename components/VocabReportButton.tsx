"use client";

import { useState } from "react";
import { createVocabReport } from "@/app/actions/vocabReports";

const ISSUES = [
  { value: "READING", label: "Sai phiên âm" },
  { value: "MEANING", label: "Sai nghĩa" },
  { value: "KIND", label: "Sai loại từ" },
  { value: "OTHER", label: "Khác" },
];

/**
 * Nút "Báo lỗi" cho user khi thấy từ sai — mở form nhỏ chọn loại lỗi + ghi chú,
 * gửi về admin duyệt ở /admin/reports. Cần đăng nhập (server từ chối nếu chưa).
 */
export default function VocabReportButton({
  word,
  reading,
  meaning,
  vocabId,
  onSent,
}: {
  word: string;
  reading: string;
  meaning: string;
  vocabId: number | null;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("MEANING");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSend() {
    if (sending) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await createVocabReport({ word, reading, currentMeaning: meaning, vocabId, issue, note });
      if (res.ok === true) {
        const merged = (res as { merged?: boolean }).merged;
        setMsg({ ok: true, text: merged ? "Đã cập nhật báo lỗi trước của bạn ✓" : "Đã gửi báo lỗi, cảm ơn bạn ✓" });
        setNote("");
        onSent?.();
        window.setTimeout(() => {
          setOpen(false);
          setMsg(null);
        }, 2200);
      } else {
        setMsg({ ok: false, text: (res as { error?: string }).error ?? "Gửi thất bại" });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gửi thất bại" });
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setMsg(null);
        }}
        title="Báo từ này sai để admin sửa"
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
      >
        ⚠️ Báo lỗi
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-rose-100 bg-rose-50/50 px-2.5 py-2" data-testid="vocab-report-form">
      <p className="text-[11px] font-bold text-slate-600">
        Báo lỗi từ “{word}”
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {ISSUES.map((o) => (
          <button
            key={o.value}
            onClick={() => setIssue(o.value)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
              issue === o.value ? "bg-rose-500 text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-rose-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú thêm (không bắt buộc)…"
        maxLength={500}
        className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
      {msg && <p className={`mt-1 text-[11px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          onClick={handleSend}
          disabled={sending}
          className="rounded-full bg-rose-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-600 disabled:opacity-60"
        >
          {sending ? "Đang gửi…" : "Gửi"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setMsg(null);
          }}
          disabled={sending}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-white"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}
