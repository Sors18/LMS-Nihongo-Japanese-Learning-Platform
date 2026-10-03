"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tokenizeBatchAction } from "@/app/actions/tokenize";
import type { TokenResult } from "@/app/actions/tokenize";
import SubtitleLine from "./SubtitleLine";
import { scrolledAwayFromActive, nearestIndicesFirst, seekFocusWindow, isSeekJump } from "@/lib/subtitleFollow";

export type SubtitleItem = {
  id: number | string;
  start_time_ms: number;
  end_time_ms: number;
  raw_text: string;
  translation?: string | null;
};

export type SubtitlePanelProps = {
  subtitles: SubtitleItem[];
  currentTimeMs: number;
  /** optional click handler — parent may seek video to subtitle start */
  onSeek?: (ms: number) => void;
  /** shadowing handler — when active subtitle has luyện shadowing button */
  onShadowing?: (sub: SubtitleItem) => void;
  className?: string;
  /** ADMIN thấy nút Sửa nhanh trong tooltip hover */
  isAdmin?: boolean;
};

/**
 * SubtitlePanel — scrollable list that highlights the active subtitle
 * where currentTimeMs ∈ [start_time_ms, end_time_ms).
 * Auto-scrolls the active line into view with smooth behavior.
 * Render + tokenize theo đợt NHỎ (PAGE dòng) để nhẹ lần đầu:
 * đợt đầu chỉ 15 dòng (~1s paint), cuộn tới đâu tải tới đó,
 * video chiếu tới đâu mở rộng tới đó. Mỗi batch tokenize ≤15 câu
 * nên server kuromoji không bị dồn 40 câu/lần như trước.
 * Client-only; no prisma/kuromoji imports.
 */
const PAGE = 15;
export default function SubtitlePanel({
  subtitles,
  currentTimeMs,
  onSeek,
  onShadowing,
  className,
  isAdmin = false,
}: SubtitlePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [tokenMap, setTokenMap] = useState<Map<string, TokenResult[]>>(new Map());
  // Follow mode: user kéo đọc dòng cũ → ngừng bám video, hiện nút Đồng bộ.
  // Tự bám lại sau 5s không chạm (theo vote) hoặc khi bấm Đồng bộ / click dòng để seek.
  const [follow, setFollow] = useState(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chặn onScroll do chính auto-scroll gây ra (tránh tự tắt follow)
  const suppressUntilRef = useRef(0);

  // Đổi video → reset về đợt đầu + bám lại
  useEffect(() => {
    setVisibleCount(PAGE);
    setTokenMap(new Map());
    setFollow(true);
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, [subtitles]);

  // Cleanup timer khi unmount
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const activeIndex = useMemo(() => {
    if (!subtitles.length) return -1;
    return subtitles.findIndex((s) => currentTimeMs >= s.start_time_ms && currentTimeMs < s.end_time_ms);
  }, [subtitles, currentTimeMs]);
  const activeId = activeIndex >= 0 ? subtitles[activeIndex].id : null;

  // Video chiếu tới ngoài vùng đang hiện → mở rộng để bám theo
  useEffect(() => {
    if (activeIndex >= 0 && activeIndex >= visibleCount) {
      setVisibleCount(Math.min(activeIndex + PAGE, subtitles.length));
    }
  }, [activeIndex, visibleCount, subtitles.length]);

  function scrollToActive(smooth = true) {
    const container = containerRef.current;
    const el = activeRef.current;
    if (!container || !el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    suppressUntilRef.current = Date.now() + 600;
    container.scrollTo({
      top: container.scrollTop + (eRect.top - cRect.top) - 8,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  function handleUserScroll() {
    if (Date.now() < suppressUntilRef.current) return;
    const container = containerRef.current;
    const el = activeRef.current;
    if (!container || !el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    // Kéo LÊN hay kéo XUỐNG đều tính (trị tuyệt đối) → ngừng bám khi lệch > 80px
    if (scrolledAwayFromActive(eRect.top, cRect.top)) {
      setFollow(false);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      // Tự bám lại sau 5s không chạm
      resumeTimerRef.current = setTimeout(() => {
        setFollow(true);
      }, 5000);
    }
  }

  function handleResync() {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    setFollow(true);
  }

  function handleSeekWithFollow(ms: number) {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    setFollow(true);
    onSeek?.(ms);
  }

  // Auto-scroll: chỉ ghim khi đang bám (follow). User đang kéo tự do → không giật.
  // Thêm visibleCount + follow vào deps để mở rộng list / bám lại vẫn ghim đúng.
  // Vừa tua (nhảy xa) → nhảy INSTANT tới vị trí (không glide mượt qua từng dòng).
  const prevScrollActiveRef = useRef<number>(-1);
  useEffect(() => {
    if (!follow || activeIndex < 0) {
      prevScrollActiveRef.current = activeIndex;
      return;
    }
    const jumped = isSeekJump(prevScrollActiveRef.current, activeIndex);
    prevScrollActiveRef.current = activeIndex;
    // requestAnimationFrame: đợi DOM sau mở rộng list render xong mới đo
    const raf = requestAnimationFrame(() => {
      scrollToActive(!jumped);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeId, activeIndex, visibleCount, follow]);

  // Prefetch tokens theo đợt NHỎ đang hiện — thiếu dòng nào mới fetch dòng đó,
  // merge vào map cũ để không fetch lại. Batch ≤ PAGE (15) câu/lần nên nhẹ server.
  // Vừa tua (seek jump): ƯU TIÊN điểm tua + 5 dòng sau trước (1 batch duy nhất),
  // bỏ qua các batch cũ còn đang bay (seq guard) để không load lần lượt từ đầu.
  // Fetch lẻ từng dòng trong TokenizedSubtitle được delay để nhường batch tua trước.
  // Chặn batch quá lớn nếu visibleCount bị nhảy vọt (seek xa): chia chunk 15.
  const prevFetchActiveRef = useRef<number>(-1);
  const fetchSeqRef = useRef(0);
  useEffect(() => {
    const slice = subtitles.slice(0, visibleCount);
    // Điểm tua chưa render xong (chờ mở rộng visibleCount) → bỏ qua vòng này
    if (activeIndex >= slice.length) {
      prevFetchActiveRef.current = activeIndex;
      return;
    }
    const missingIdx: number[] = [];
    slice.forEach((s, i) => {
      if (!tokenMap.has(String(s.id))) missingIdx.push(i);
    });
    if (missingIdx.length === 0) {
      prevFetchActiveRef.current = activeIndex;
      return;
    }
    const jumped = isSeekJump(prevFetchActiveRef.current, activeIndex);
    prevFetchActiveRef.current = activeIndex;
    let batch: number[];
    if (jumped) {
      // Ưu tiên tuyệt đối: chỉ lấy cửa sổ điểm tua trước, phần còn lại đợi vòng sau
      const window = seekFocusWindow(activeIndex, slice.length).filter((i) => !tokenMap.has(String(slice[i].id)));
      batch = window.length > 0 ? window : nearestIndicesFirst(missingIdx, activeIndex).slice(0, PAGE);
    } else {
      batch = nearestIndicesFirst(missingIdx, activeIndex).slice(0, PAGE);
    }
    const seq = ++fetchSeqRef.current;
    let cancelled = false;
    tokenizeBatchAction(batch.map((i) => slice[i].raw_text ?? ""))
      .then((rows) => {
        if (cancelled || fetchSeqRef.current !== seq) return;
        setTokenMap((prev) => {
          const m = new Map(prev);
          batch.forEach((si, k) => m.set(String(slice[si].id), rows[k] ?? []));
          return m;
        });
      })
      .catch(() => {
        // fetch lẻ từng dòng trong TokenizedSubtitle lo phần còn lại
      });
    return () => {
      cancelled = true;
    };
  }, [subtitles, visibleCount, tokenMap, activeIndex]);

  // Cuộn gần tới cuối đợt → tự tải đợt tiếp (kèm nút bấm dự phòng)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= subtitles.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE, subtitles.length));
        }
      },
      { root: containerRef.current, rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [subtitles, visibleCount]);

  if (!subtitles.length) {
    return (
      <div
        data-testid="subtitle-panel"
        className={`flex h-[360px] items-center justify-center rounded-lg border border-sakura-200 bg-white p-4 text-sm text-slate-500 shadow-sm ${className ?? ""}`}
      >
        Chưa có phụ đề cho video này.
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
    <div
      ref={containerRef}
      data-testid="subtitle-panel"
      onScroll={handleUserScroll}
      className="flex h-[360px] flex-col overflow-y-auto rounded-2xl border border-sakura-200 bg-white shadow-sm scrollbar-thin"
    >
      <div className="divide-y divide-sakura-100">
        {subtitles.slice(0, visibleCount).map((sub) => {
          const isActive = sub.id === activeId;
          return (
            <div
              key={sub.id}
              ref={isActive ? activeRef : null}
              data-testid="subtitle-item"
              data-subtitle-id={String(sub.id)}
              data-active={isActive ? "true" : "false"}
              data-start={sub.start_time_ms}
              data-end={sub.end_time_ms}
              onClick={() => handleSeekWithFollow(sub.start_time_ms)}
              className={
                isActive
                  ? "cursor-pointer border-l-4 border-sakura-500 bg-sakura-50 px-3 py-2.5 transition-colors"
                  : "cursor-pointer border-l-4 border-transparent px-3 py-2.5 hover:bg-sakura-50/70 transition-colors"
              }
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-sakura-400">
                <span>{formatMsShort(sub.start_time_ms)}</span>
                <span aria-hidden>—</span>
                <span>{formatMsShort(sub.end_time_ms)}</span>
              </div>
              {/* SubtitleLine is the extension point for Slice D tokenization */}
              <SubtitleLine raw_text={sub.raw_text} translation={sub.translation ?? null} active={isActive} id={sub.id} tokens={tokenMap?.get(String(sub.id))} isAdmin={isAdmin} />
              {isActive && onShadowing && (
                <button
                  data-testid="shadowing-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShadowing(sub);
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-sakura-500 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-sakura-600"
                >
                  🎙 Luyện shadowing
                </button>
              )}
            </div>
          );
        })}
      </div>
      {visibleCount < subtitles.length ? (
        <div ref={sentinelRef} className="px-3 py-3 text-center">
          <button
            onClick={() => setVisibleCount((c) => Math.min(c + PAGE, subtitles.length))}
            className="rounded-full border border-sakura-200 bg-sakura-50 px-4 py-1.5 text-xs font-medium text-sakura-700 hover:bg-sakura-100"
          >
            Xem thêm ({subtitles.length - visibleCount} dòng còn lại)
          </button>
          <p className="mt-1 text-[11px] text-slate-400">
            Đang hiện {visibleCount}/{subtitles.length} dòng
          </p>
        </div>
      ) : (
        subtitles.length > PAGE && (
          <p className="px-3 py-2 text-center text-[11px] text-slate-400">Đã hiện toàn bộ {subtitles.length} dòng</p>
        )
      )}
      </div>
      {/* Nút Đồng bộ nổi dưới panel — hiện khi user đang kéo tự do */}
      {!follow && activeId !== null && (
        <button
          data-testid="subtitle-resync"
          onClick={handleResync}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-sakura-500 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-sakura-600 transition"
        >
          ⇅ Đồng bộ
        </button>
      )}
    </div>
  );
}

/**
 * Format milliseconds to m:ss — exported so both panel and history share contract.
 * Kept as exported helper to avoid tiny-function duplication.
 */
export function formatMsShort(ms: number): string {
  if (ms == null || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
