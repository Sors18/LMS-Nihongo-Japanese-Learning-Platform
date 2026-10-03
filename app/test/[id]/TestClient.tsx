"use client";

import { useRouter } from "next/navigation";
import VideoTest from "@/components/VideoTest";

type Q = { id: number; question_type: string; content: string; options: unknown; correct_answer: string };

export default function TestClient({ videoId, questions, title }: { videoId: number; questions: Q[]; title: string }) {
  const router = useRouter();
  const handleClose = () => {
    router.push(`/video/${videoId}`);
  };
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
        <VideoTest questions={questions} videoId={videoId} open={true} onClose={handleClose} />
      )}
    </div>
  );
}
