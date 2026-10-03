"use client";

import { useCallback, useMemo, useState } from "react";
import VideoPlayer from "./VideoPlayer";
import SubtitlePanel from "./SubtitlePanel";
import VideoTest from "./VideoTest";
import VocabExtractor from "./VocabExtractor";
import GrammarExtractor from "./GrammarExtractor";
import AutoTestGenerator from "./AutoTestGenerator";
import ShadowingPlayer from "./ShadowingPlayer";
import { openPekoraWithVideo } from "@/lib/pekora";
import { splitTrailingVietnamese } from "@/lib/bilingual";
import { recordActivity } from "@/app/actions/streak";
type SubtitleRow = { id: number; start_time_ms: number; end_time_ms: number; raw_text: string; translation?: string | null };
type QuestionRow = { id: number; question_type: string; content: string; options: unknown; correct_answer: string };

export default function VideoDetailClient({
  videoId,
  youtubeId,
  title,
  level,
  duration,
  subtitles,
  questions,
  isLoggedIn = false,
  isAdmin = false,
}: {
  videoId: number;
  youtubeId: string;
  title: string;
  level?: string;
  duration: number;
  subtitles: SubtitleRow[];
  questions: QuestionRow[];
  isLoggedIn?: boolean;
  isAdmin?: boolean;
}) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [showTest, setShowTest] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [shadowing, setShadowing] = useState<SubtitleRow | null>(null);
  // Mỗi lần click sub tăng seq → VideoPlayer tua thật tới ms đó
  const [seekRequest, setSeekRequest] = useState<{ ms: number; seq: number } | null>(null);
  const durationMs = useMemo(() => duration * 1000, [duration]);

  const handleTimeUpdate = useCallback((ms: number) => setCurrentTimeMs(ms), []);
  const handleEnded = useCallback(() => {
    setHasEnded(true);
    // Không popup tự động — chỉ hiện gợi ý làm test ở cột phải
    // Xem hết video = hoạt động học → ghi streak (best effort, lỗi thì thôi)
    if (isLoggedIn) {
      recordActivity().catch(() => {});
    }
  }, [isLoggedIn]);
  const handleSeek = useCallback((ms: number) => {
    setCurrentTimeMs(ms);
    setSeekRequest((prev) => ({ ms, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const activeSubtitle = useMemo(() => {
    if (!subtitles.length) return null;
    const found = subtitles.find((s) => currentTimeMs >= s.start_time_ms && currentTimeMs < s.end_time_ms);
    return found ?? null;
  }, [subtitles, currentTimeMs]);

  const handleShadowing = useCallback((sub: { id: number | string; start_time_ms: number; end_time_ms: number; raw_text: string }) => {
    setShadowing(sub as SubtitleRow);
  }, []);

  const handleCloseShadowing = useCallback(() => setShadowing(null), []);

  const handleOpenTest = useCallback(() => {
    if (!isLoggedIn) {
      window.location.href = "/login?next=/video/" + videoId;
      return;
    }
    setShowTest(true);
  }, [isLoggedIn, videoId]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <VideoPlayer
          youtubeId={youtubeId}
          durationMs={durationMs}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          overlayText={activeSubtitle?.raw_text ?? null}
          overlayTranslation={activeSubtitle?.translation ?? null}
          seekRequest={seekRequest}
        />

        {/* Trích xuất từ vựng / ngữ pháp / tự sinh test — không preview câu hỏi, chỉ nút tạo */}

        <div className="grid gap-4">
          <VocabExtractor videoId={videoId} isAdmin={isAdmin} />
          <GrammarExtractor videoId={videoId} />
          <AutoTestGenerator videoId={videoId} existingCount={questions.length} />
        </div>
      </div>

      <div className="space-y-4">
        {/* Phụ đề lên trên cùng cột phải */}
        <SubtitlePanel subtitles={subtitles} currentTimeMs={currentTimeMs} onSeek={handleSeek} onShadowing={handleShadowing} isAdmin={isAdmin} />
        {activeSubtitle && !shadowing && (
          <div className="rounded-xl border border-sakura-200 bg-sakura-50 p-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600 line-clamp-2 flex-1">
              <span className="font-semibold text-sakura-700">Đang chọn:</span> {splitTrailingVietnamese(activeSubtitle.raw_text).jp.slice(0, 80)}
              {splitTrailingVietnamese(activeSubtitle.raw_text).jp.length > 80 ? "…" : ""}
            </p>
            <button
              data-testid="shadowing-quick-trigger"
              onClick={() => handleShadowing(activeSubtitle)}
              className="shrink-0 rounded-full bg-sakura-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sakura-600"
            >
              🎙 Luyện shadowing
            </button>
          </div>
        )}
        {shadowing && (
          <ShadowingPlayer
            subtitle={shadowing}
            youtubeId={youtubeId}
            start_ms={shadowing.start_time_ms}
            end_ms={shadowing.end_time_ms}
            onClose={handleCloseShadowing}
          />
        )}

        {/* Mở popup Pekora góc màn hình (dùng chung, kèm ngữ cảnh video) */}
        <button
          onClick={() => openPekoraWithVideo({ id: videoId, title, level })}
          className="w-full rounded-full border border-sakura-200 bg-white px-4 py-2.5 text-sm font-bold text-sakura-700 shadow-sm hover:bg-sakura-500 hover:text-white hover:border-sakura-500 transition-colors"
        >
          🐰 Hỏi Pekora về video này
        </button>

        {/* Test card xuống dưới — yêu cầu đăng nhập, không preview câu hỏi */}
        <div className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Bài kiểm tra</h3>
          <p className="mt-1 text-xs text-slate-500">
            {questions.length > 0 ? `${questions.length} câu hỏi • Yêu cầu đăng nhập để làm bài` : "Chưa có câu hỏi cho video này"}
          </p>
          {hasEnded && questions.length > 0 && (
            <p className="mt-2 text-xs font-medium text-sakura-600">Video đã kết thúc — bạn có thể làm test ngay.</p>
          )}
          {questions.length > 0 ? (
            isLoggedIn ? (
              <button onClick={handleOpenTest} className="mt-3 w-full rounded-full bg-sakura-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sakura-600">
                Làm test ({questions.length} câu)
              </button>
            ) : (
              <a href={`/login?next=/video/${videoId}`} className="mt-3 block w-full rounded-full bg-sakura-500 px-4 py-2.5 text-center text-sm font-bold text-white shadow-sm hover:bg-sakura-600">
                Đăng nhập để làm test
              </a>
            )
          ) : (
            <p className="mt-3 text-xs text-slate-400">Tạo câu hỏi ở bên trái (Quét ngữ pháp / Tự tạo test) để có bài kiểm tra.</p>
          )}
          {!isLoggedIn && questions.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400">Bạn phải đăng nhập mới được làm test. Không hiện preview câu hỏi.</p>
          )}
        </div>

        {isAdmin && (
          <details className="rounded-xl border border-sakura-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Debug — {title} · {subtitles.length} phụ đề
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              currentTimeMs: <span className="font-mono text-sakura-600">{currentTimeMs}</span> · durationMs:{" "}
              <span className="font-mono">{durationMs}</span>
            </p>
          </details>
        )}
      </div>

      {/* Modal test — chỉ mở khi bấm nút, không popup tự động */}
      <VideoTest questions={questions} videoId={videoId} open={showTest} onClose={() => setShowTest(false)} />
    </div>
  );
}
