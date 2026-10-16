"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import VideoTest from "@/components/VideoTest";

type Q = { id: number; question_type: string; content: string; options: unknown; correct_answer: string };

function sampleQuestions(all: Q[], n: number): Q[] {
  if (n <= 0 || n >= all.length) return all;
  const a = [...all];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t!;
  }
  // Giữ thứ tự id gốc cho ổn định khi nộp bài
  return a.slice(0, n).sort((x, y) => x.id - y.id);
}

type Sub = { id: number; raw_text: string; start_time_ms: number; end_time_ms: number };

export default function TestClient({ videoId, questions, title, youtubeId, subtitles }: { videoId: number; questions: Q[]; title: string; youtubeId?: string; subtitles?: Sub[] }) {
  const router = useRouter();
  const [attemptCount, setAttemptCount] = useState<number>(0); // 0 = tất cả
  const [round, setRound] = useState(0); // đổi đề khi bấm "Đổi đề"
  const activeQuestions = useMemo(
    () => (attemptCount <= 0 ? questions : sampleQuestions(questions, attemptCount)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, attemptCount, round]
  );
  const handleClose = () => {
    router.push(`/video/${videoId}`);
  };
  const countOptions = [5, 10, 15].filter((n) => n < questions.length);
  return (
    <div className="space-y-6">
      <button onClick={handleClose} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← Quay lại Video #{videoId}
      </button>
      <div>
        <h1 className="text-xl font-bold text-white">Làm bài — {title}</h1>
        <p className="mt-1 text-sm text-slate-400">{questions.length} câu · Video #{videoId} · Trả lời rồi bấm Nộp bài để xem điểm</p>
      </div>
      {questions.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 text-center">
          <p className="text-sm text-slate-300">Chưa có câu hỏi cho video này.</p>
          <button onClick={handleClose} className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Quay lại tạo test →
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              Số câu muốn làm:
              <select
                value={attemptCount}
                onChange={(e) => setAttemptCount(Number(e.target.value))}
                className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-indigo-400 focus:outline-none"
              >
                <option value={0}>Tất cả ({questions.length})</option>
                {countOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} câu ngẫu nhiên
                  </option>
                ))}
              </select>
            </label>
            {attemptCount > 0 && (
              <button
                onClick={() => setRound((r) => r + 1)}
                className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                🎲 Đổi đề ({activeQuestions.length} câu)
              </button>
            )}
            {attemptCount > 0 && <span className="text-xs text-slate-400">Đang làm {activeQuestions.length}/{questions.length} câu</span>}
          </div>
          <VideoTest key={`${attemptCount}-${round}`} questions={activeQuestions} videoId={videoId} open={true} onClose={handleClose} youtubeId={youtubeId} subtitles={subtitles} />
        </>
      )}
    </div>
  );
}
