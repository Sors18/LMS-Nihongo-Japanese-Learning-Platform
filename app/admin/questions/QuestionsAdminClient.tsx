"use client";

import { useMemo, useState, useTransition } from "react";
import { updateQuestionAction, deleteQuestionAction, cleanJunkQuestions } from "@/app/actions/manageQuestion";

type Q = {
  id: number;
  question_type: string;
  content: string;
  options: string[];
  correct_answer: string;
};

const TYPE_LABEL: Record<string, string> = {
  VOCAB_CHOICE: "Từ vựng",
  FILL_PARTICLE: "Trợ từ",
  LISTENING: "Nghe hiểu",
};

const TYPE_FILTERS = ["ALL", "VOCAB_CHOICE", "FILL_PARTICLE", "LISTENING"] as const;

export default function QuestionsAdminClient({
  video,
  questions: initial,
}: {
  video: { id: number; title: string; level: string; youtube_id: string };
  questions: Q[];
}) {
  const [questions, setQuestions] = useState<Q[]>(initial);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Q | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editOptionsText, setEditOptionsText] = useState("");
  const [editCorrect, setEditCorrect] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [cleanConfirm, setCleanConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleClean = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await cleanJunkQuestions(video.id);
      setCleanConfirm(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.deleted === 0) {
        setSuccess(`Không có câu rác — ${res.total} câu đều đạt (có chữ Nhật, không phải tên người)`);
        return;
      }
      const gone = new Set(res.deletedIds);
      setQuestions((prev) => prev.filter((x) => !gone.has(x.id)));
      setSuccess(`Đã dọn ${res.deleted}/${res.total} câu rác (sub thuần Việt / tên người)`);
    });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: questions.length };
    for (const q of questions) c[q.question_type] = (c[q.question_type] ?? 0) + 1;
    return c;
  }, [questions]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return questions.filter((q) => {
      if (typeFilter !== "ALL" && q.question_type !== typeFilter) return false;
      if (!kw) return true;
      const hay = `${q.content} ${q.correct_answer} ${q.options.join(" ")}`.toLowerCase();
      return hay.includes(kw);
    });
  }, [questions, typeFilter, keyword]);

  const openEdit = (q: Q) => {
    setEditing(q);
    setEditContent(q.content);
    setEditOptionsText(q.options.join("\n"));
    setEditCorrect(q.correct_answer);
    setError(null);
    setSuccess(null);
  };

  const editOptionsPreview = useMemo(
    () => editOptionsText.split("\n").map((s) => s.trim()).filter((s) => s !== ""),
    [editOptionsText]
  );

  const handleSave = () => {
    if (!editing) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await updateQuestionAction({
        questionId: editing.id,
        content: editContent,
        options: editOptionsPreview,
        correct_answer: editCorrect.trim() || editOptionsPreview[0],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setQuestions((prev) =>
        prev.map((x) =>
          x.id === editing.id
            ? { ...x, content: res.question.content, options: res.question.options, correct_answer: res.question.correct_answer }
            : x
        )
      );
      setSuccess(`Đã lưu câu #${editing.id}`);
      setEditing(null);
    });
  };

  const handleDelete = (id: number) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteQuestionAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setQuestions((prev) => prev.filter((x) => x.id !== id));
      setDeleteConfirm(null);
      setSuccess(`Đã xóa câu #${id}`);
    });
  };

  return (
    <div className="space-y-4">
      <a href="/admin/questions" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← Tất cả video có câu hỏi
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Câu hỏi — Video #{video.id}
            <span className="ml-2 rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 align-middle text-xs font-bold text-sakura-700">{video.level}</span>
          </h1>
          <p className="mt-1 max-w-[640px] truncate text-sm text-slate-400" title={video.title}>{video.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {questions.length} câu · VOCAB {counts.VOCAB_CHOICE ?? 0} · Trợ từ {counts.FILL_PARTICLE ?? 0} · Nghe {counts.LISTENING ?? 0} · Đáp án HIỆN cho admin
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/video/${video.id}`} className="rounded-full bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 shadow-sm">Xem video</a>
          <a href={`/test/${video.id}`} className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 shadow-sm">Làm bài như user →</a>
          {cleanConfirm ? (
            <>
              <button onClick={handleClean} disabled={isPending} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-sm">
                {isPending ? "Đang dọn…" : `Xóa câu rác?`}
              </button>
              <button onClick={() => setCleanConfirm(false)} className="rounded-full border border-sakura-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-sakura-50">Hủy</button>
            </>
          ) : (
            <button onClick={() => { setCleanConfirm(true); setError(null); setSuccess(null); }} title="Xóa câu sub thuần Việt + câu hỏi tên người (đề cũ sinh trước bộ lọc mới)" className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 shadow-sm">
              🧹 Dọn câu rác
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</p>}
      {success && <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">{success}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${typeFilter === t ? "bg-sakura-500 text-white shadow-sm" : "border border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50"}`}
          >
            {t === "ALL" ? `Tất cả (${counts.ALL ?? 0})` : `${TYPE_LABEL[t] ?? t} (${counts[t] ?? 0})`}
          </button>
        ))}
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm nội dung / đáp án…"
          className="ml-auto w-full max-w-xs rounded-full border border-sakura-200 bg-white px-4 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sakura-300 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-sakura-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">Không có câu hỏi nào khớp bộ lọc.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((q, idx) => (
            <li key={q.id} className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="flex gap-2 text-sm text-slate-800">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sakura-500 text-xs font-bold text-white">{idx + 1}</span>
                  <span className="flex-1">{q.content}</span>
                </p>
                <span className="shrink-0 rounded border border-sakura-200 bg-sakura-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sakura-700">
                  {TYPE_LABEL[q.question_type] ?? q.question_type}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {q.options.map((opt, i) => {
                  const isCorrect = opt === q.correct_answer;
                  return (
                    <p
                      key={i}
                      className={`rounded-md border px-3 py-1.5 text-sm ${isCorrect ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800" : "border-sakura-100 bg-sakura-50/50 text-slate-600"}`}
                    >
                      {isCorrect ? "✅ " : `${String.fromCharCode(65 + i)}. `}{opt}
                    </p>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-slate-400">#{q.id}</span>
                <span className="ml-auto flex gap-2">
                  <button onClick={() => openEdit(q)} className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 shadow-sm">Sửa</button>
                  {deleteConfirm === q.id ? (
                    <>
                      <button onClick={() => handleDelete(q.id)} disabled={isPending} className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">Xác nhận xóa?</button>
                      <button onClick={() => setDeleteConfirm(null)} className="rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-sakura-50">Hủy</button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(q.id)} className="rounded-full border-2 border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50">Xóa</button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-sakura-200 bg-white p-5">
            <h3 className="text-lg font-bold text-slate-800">
              Sửa câu #{editing.id} · <span className="text-xs font-semibold text-sakura-600">{TYPE_LABEL[editing.question_type] ?? editing.question_type}</span>
            </h3>
            <div>
              <label className="text-sm font-medium text-slate-700">Nội dung *</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                maxLength={2000}
                className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Lựa chọn — mỗi dòng 1 đáp án (2–6 dòng) *</label>
              <textarea
                value={editOptionsText}
                onChange={(e) => {
                  setEditOptionsText(e.target.value);
                  // Nếu đáp án đúng không còn trong list thì reset về dòng đầu
                  const lines = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                  if (lines.length && !lines.includes(editCorrect)) setEditCorrect(lines[0]!);
                }}
                rows={5}
                className="mt-1 w-full rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 font-mono text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">Đang có {editOptionsPreview.length} lựa chọn hợp lệ.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Đáp án đúng * (phải nằm trong lựa chọn)</label>
              <select
                value={editOptionsPreview.includes(editCorrect) ? editCorrect : ""}
                onChange={(e) => setEditCorrect(e.target.value)}
                className="mt-1 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 focus:border-emerald-400 focus:outline-none"
              >
                <option value="" disabled>— Chọn đáp án đúng —</option>
                {editOptionsPreview.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-sakura-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-700 hover:text-white">Hủy</button>
              <button onClick={handleSave} disabled={isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {isPending ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
