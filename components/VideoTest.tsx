"use client";

import { useEffect, useState, useTransition } from "react";
import { submitTest } from "@/app/actions/test";

type Question = {
  id: number;
  question_type: string;
  content: string;
  options: unknown;
  correct_answer: string;
};

type Props = {
  questions: Question[];
  videoId: number;
  open?: boolean;
  onClose?: () => void;
  triggerLabel?: string;
};

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
      // fall through
    }
    return [];
  }
  if (typeof raw === "object" && "options" in (raw as Record<string, unknown>)) {
    const opts = (raw as Record<string, unknown>).options;
    if (Array.isArray(opts)) return opts.map(String);
  }
  return [];
}

const TYPE_LABEL: Record<string, string> = {
  VOCAB_CHOICE: "Từ vựng",
  FILL_PARTICLE: "Trợ từ",
  LISTENING: "Nghe hiểu",
};

function speakJapanese(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find((v) => v.lang.startsWith("ja"));
  if (jaVoice) u.voice = jaVoice;
  window.speechSynthesis.speak(u);
}

/** Lấy URL mp3 server (/api/tts, có cache public/tts). Thất bại → null để fallback speechSynthesis. */
async function fetchServerTtsUrl(text: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}&lang=ja`);
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return typeof data.url === "string" ? data.url : null;
  } catch {
    return null;
  }
}

function ListeningPlayButton({ text, fallback }: { text: string; fallback: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const playServer = async () => {
    if (url) {
      await new Audio(url).play().catch(() => speakJapanese(text || fallback));
      return;
    }
    setLoading(true);
    try {
      const u = await fetchServerTtsUrl(text || fallback);
      if (u) {
        setUrl(u);
        await new Audio(u).play().catch(() => speakJapanese(text || fallback));
      } else {
        speakJapanese(text || fallback);
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={playServer}
        disabled={loading}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sakura-500 text-sm text-white hover:bg-sakura-600 shadow-sm disabled:opacity-50"
        aria-label="Phát âm thanh"
      >
        {loading ? "…" : "▶"}
      </button>
      {url && (
        <audio src={url} controls preload="none" className="h-8 w-full max-w-[220px]">
          <track kind="captions" />
        </audio>
      )}
    </>
  );
}

export default function VideoTest({ questions, videoId, open: controlledOpen, onClose, triggerLabel }: Props) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen! : internalOpen;
  const handleOpen = () => {
    if (!isControlled) setInternalOpen(true);
  };

  const total = questions.length;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await submitTest({ videoId, answers });
        setResult({ score: res.score, total: res.total });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nộp bài thất bại");
      }
    });
  };

  const handleClose = () => {
    setAnswers({});
    setResult(null);
    setError(null);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (isControlled) {
      if (onClose) onClose();
      else setInternalOpen(false);
    } else setInternalOpen(false);
  };

  const handleRetake = () => {
    setAnswers({});
    setResult(null);
    setError(null);
  };

  if (!open) {
    if (!isControlled) {
      return (
        <div className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Bài kiểm tra ({questions.length} câu)</h3>
              <p className="mt-1 text-xs text-slate-500">Hoàn thành video để mở bài kiểm tra — hoặc bấm nút để làm ngay.</p>
            </div>
            <button
              onClick={handleOpen}
              disabled={questions.length === 0}
              className="rounded-md bg-sakura-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {triggerLabel ?? "Làm bài ngay"}
            </button>
          </div>
          {questions.length === 0 && <p className="mt-3 text-xs text-slate-500">Chưa có câu hỏi cho video này.</p>}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Đóng bài kiểm tra" onClick={handleClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-xl border border-sakura-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-sakura-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Bài kiểm tra — Video #{videoId}</h2>
          <button onClick={handleClose} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-sakura-50 hover:text-slate-700">
            ✕ Đóng
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white px-5 py-5 scrollbar-thin space-y-6">
          {total === 0 ? (
            <p className="text-sm text-slate-500">Chưa có câu hỏi cho video này.</p>
          ) : result ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
              <p className="text-3xl font-bold text-emerald-600">
                {result.score} / {result.total}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {result.score === result.total
                  ? "Xuất sắc! Bạn đã trả lời đúng hết."
                  : result.score >= Math.ceil(result.total / 2)
                    ? "Khá tốt — tiếp tục cố gắng!"
                    : "Hãy xem lại video và thử lại nhé."}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button onClick={handleRetake} className="rounded-md border border-sakura-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-sakura-50">
                  Làm lại
                </button>
                <button onClick={handleClose} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 shadow-sm">
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            questions.map((q, idx) => {
              const opts = parseOptions(q.options);
              const typeLabel = TYPE_LABEL[q.question_type] ?? q.question_type;
              const isListening = q.question_type === "LISTENING";
              // Cắt intro: với LISTENING không hiện content gốc, chỉ hiện box nghe
              const displayContent = isListening ? "" : q.content;
              const speakText = isListening ? q.correct_answer : "";
              const showContentHeader = !isListening;
              return (
                <div key={q.id} className="rounded-lg border border-sakura-200 bg-white p-4 shadow-sm">
                  {showContentHeader && (
                    <p className="text-sm font-medium text-slate-800">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sakura-500 text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      {displayContent}
                    </p>
                  )}
                  {isListening && (
                    <p className="text-sm font-medium text-slate-800">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sakura-500 text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      Nghe hiểu
                    </p>
                  )}
                  <span className="mt-1 inline-block rounded border border-sakura-200 bg-sakura-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sakura-700">
                    {typeLabel}
                  </span>

                  <div className="mt-3">
                    {q.question_type === "VOCAB_CHOICE" && (
                      opts.length === 0 ? (
                        <p className="text-xs text-slate-500">Không có lựa chọn.</p>
                      ) : (
                        opts.map((opt, i) => (
                          <label
                            key={`${q.id}-${i}`}
                            className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
                              answers[String(q.id)] === opt
                                ? "border-sakura-500 bg-sakura-50 text-slate-800"
                                : "border-sakura-200 bg-white text-slate-700 hover:border-sakura-300 hover:bg-sakura-50/60"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={opt}
                              checked={answers[String(q.id)] === opt}
                              onChange={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: opt }))}
                              className="h-4 w-4 accent-sakura-500"
                            />
                            <span>{opt}</span>
                          </label>
                        ))
                      )
                    )}

                    {q.question_type === "FILL_PARTICLE" && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">Chọn trợ từ đúng (khoanh tròn):</p>
                        {opts.length === 0 ? (
                          <p className="text-xs text-slate-500">Không có lựa chọn.</p>
                        ) : (
                          opts.map((opt, i) => (
                            <label
                              key={`${q.id}-p-${i}`}
                              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
                                answers[String(q.id)] === opt
                                  ? "border-sakura-500 bg-sakura-50 text-slate-800"
                                  : "border-sakura-200 bg-white text-slate-700 hover:border-sakura-300 hover:bg-sakura-50/60"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                value={opt}
                                checked={answers[String(q.id)] === opt}
                                onChange={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: opt }))}
                                className="h-4 w-4 accent-sakura-500"
                              />
                              <span className="font-mono text-base">{opt}</span>
                            </label>
                          ))
                        )}
                      </div>
                    )}

                    {q.question_type === "LISTENING" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 rounded-md border border-dashed border-sakura-200 bg-sakura-50 px-3 py-3">
                          <ListeningPlayButton text={speakText} fallback={q.content} />
                          <div className="flex-1">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Nghe &amp; trả lời</p>
                            <p className="text-sm text-slate-700">Bấm ▶ để nghe, sau đó chọn đáp án bên dưới</p>
                          </div>
                          <span className="text-[11px] text-sakura-500">ja-JP</span>
                        </div>
                        {opts.length > 0 ? (
                          <div className="space-y-2">
                            {opts.map((opt, i) => (
                              <label
                                key={`${q.id}-l-${i}`}
                                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
                                  answers[String(q.id)] === opt
                                    ? "border-sakura-500 bg-sakura-50 text-slate-800"
                                    : "border-sakura-200 bg-white text-slate-700 hover:border-sakura-300 hover:bg-sakura-50/60"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`q-${q.id}`}
                                  value={opt}
                                  checked={answers[String(q.id)] === opt}
                                  onChange={() => setAnswers((prev) => ({ ...prev, [String(q.id)]: opt }))}
                                  className="h-4 w-4 accent-sakura-500"
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="Nhập nội dung bạn nghe được…"
                            value={answers[String(q.id)] ?? ""}
                            onChange={(e) => setAnswers((prev) => ({ ...prev, [String(q.id)]: e.target.value }))}
                            className="w-full rounded-md border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-400 focus:outline-none focus:ring-1 focus:ring-sakura-300"
                          />
                        )}
                      </div>
                    )}

                    {!["VOCAB_CHOICE", "FILL_PARTICLE", "LISTENING"].includes(q.question_type) && (
                      <input
                        type="text"
                        placeholder="Nhập đáp án…"
                        value={answers[String(q.id)] ?? ""}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [String(q.id)]: e.target.value }))}
                        className="w-full rounded-md border border-sakura-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sakura-400 focus:outline-none focus:ring-1 focus:ring-sakura-300"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}

          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        {!result && total > 0 && (
          <div className="flex items-center justify-between border-t border-sakura-200 bg-sakura-50/50 px-5 py-4">
            <p className="text-xs text-slate-500">Đã trả lời {Object.keys(answers).filter((k) => (answers[k] ?? "").trim() !== "").length} / {total}</p>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="rounded-md bg-sakura-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isPending ? "Đang nộp…" : "Nộp bài"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
