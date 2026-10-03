"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { Fragment } from "react";
import { splitSpeakerSegments } from "@/lib/dialogue";
import { isVietnameseOnly, splitTrailingVietnamese } from "@/lib/bilingual";

// Dynamic import to avoid SSR window access — react-player is client-only
// react-player has no ESM default that is safe during SSR, so we load it
// dynamically. The cast is required because next/dynamic loses the component
// type; we restore it with an unchecked cast on a library boundary.
const ReactPlayer = dynamic(() => import("react-player"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-black text-slate-400 text-sm">
      Đang tải trình phát...
    </div>
  ),
}) as unknown as ComponentType<Record<string, unknown>>;


export type VideoPlayerProps = {
  youtubeId: string;
  /** total duration in milliseconds — used for progress bar; also updated from player onDuration */
  durationMs?: number;
  /** called every ~200ms with current playback time in ms */
  onTimeUpdate?: (currentMs: number) => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onDuration?: (durationMs: number) => void;
  /** seek to this time on ready (ms) */
  startAtMs?: number;
  autoPlay?: boolean;
  /** Câu phụ đề đang active — hiện overlay trên mặt video (kiểu sub YouTube) */
  overlayText?: string | null;
  /** Bản dịch Việt song ngữ — hiện nhỏ dưới câu Nhật */
  overlayTranslation?: string | null;
  /** Yêu cầu tua: mỗi lần seq tăng thì seek tới ms (click sub → nhảy video thật) */
  seekRequest?: { ms: number; seq: number } | null;
};

type PlayerHandle = {
  getCurrentTime: () => number;
  seekTo: (amount: number, type?: "seconds" | "fraction") => void;
  getInternalPlayer?: (host?: string) => unknown;
};
/**
 * Bước tua phím mũi tên kiểu YouTube (ms). Trái/phải = ∓5s, phím khác = null.
 * Pure để test không cần DOM.
 */
export function arrowSeekDeltaMs(key: string): number | null {
  if (key === "ArrowLeft") return -5000;
  if (key === "ArrowRight") return 5000;
  return null;
}
/**
 * VideoPlayer — client component wrapping react-player (YouTube).
 * - Uses useRef for player instance
 * - Polls getCurrentTime() every 200ms while playing
 * - MUST NOT import prisma/kuromoji (client boundary)
 */
export default function VideoPlayer({
  youtubeId,
  durationMs,
  onTimeUpdate,
  onEnded,
  onPlay,
  onPause,
  onDuration,
  startAtMs,
  autoPlay = false,
  overlayText,
  overlayTranslation,
  seekRequest,
}: VideoPlayerProps) {
  const playerRef = useRef<PlayerHandle | null>(null);
  const intervalRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMsState, setDurationMsState] = useState<number>(durationMs ?? 0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [showOverlay, setShowOverlay] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  // Tự ẩn điều khiển + chuột khi không tương tác (kiểu YouTube, nhất là lúc fullscreen)
  const [showControls, setShowControls] = useState(true);
  // Video đã phát hết → che endscreen YouTube (video khác / logo) bằng màn hình của web
  const [ended, setEnded] = useState(false);

  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  // Sync external durationMs prop (e.g. from DB) into local state
  useEffect(() => {
    if (typeof durationMs === "number" && durationMs > 0) {
      setDurationMsState(durationMs);
    }
  }, [durationMs]);

  // Seek theo yêu cầu ngoài (click sub / nút shadowing): tua player thật
  useEffect(() => {
    if (!seekRequest || seekRequest.seq <= 0) return;
    const ms = Math.max(0, Math.floor(seekRequest.ms));
    try {
      playerRef.current?.seekTo?.(ms / 1000, "seconds");
    } catch {
      // ignore seek failure
    }
    setCurrentMs(ms);
    setEnded(false);
    onTimeUpdate?.(ms);
  }, [seekRequest, onTimeUpdate]);

  // Đổi video → reset trạng thái kết thúc
  useEffect(() => {
    setEnded(false);
    setCurrentMs(0);
  }, [youtubeId]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      const raw = playerRef.current?.getCurrentTime?.();
      if (typeof raw === "number" && !Number.isNaN(raw)) {
        const ms = Math.floor(raw * 1000);
        setCurrentMs(ms);
        onTimeUpdate?.(ms);
      }
    }, 200);
  }, [clearTimer, onTimeUpdate]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, [clearTimer]);

  // Hiện điều khiển khi chuột động, tự ẩn sau 3s nếu đang phát (đỡ che/tối video)
  const pokeControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      // Chỉ ẩn khi đang phát — pause thì giữ để dễ bấm
      setIsPlaying((playing) => {
        if (playing) setShowControls(false);
        return playing;
      });
    }, 3000);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      setShowControls(true);
    } else {
      pokeControls();
    }
  }, [isPlaying, pokeControls]);

  const handleReady = useCallback(() => {
    // Tắt triệt để caption YouTube: playerVars cc_load_policy=0 chỉ mặc định,
    // nếu user từng bật CC thì Youtube vẫn hiện → phải unload module qua Iframe API
    try {
      const internal = (playerRef.current as unknown as { getInternalPlayer?: (h?: string) => unknown })?.getInternalPlayer?.("youtube") as
        | { unloadModule?: (m: string) => void; setOption?: (mod: string, opt: string, val: unknown) => void; getOption?: (m: string, o: string) => unknown }
        | undefined;
      // Thử cả không tham số (react-player cũ) và "youtube"
      const alt = !internal
        ? ((playerRef.current as unknown as { getInternalPlayer?: () => unknown })?.getInternalPlayer?.() as
            | { unloadModule?: (m: string) => void; setOption?: (m: string, o: string, val: unknown) => void }
            | undefined)
        : undefined;
      const yt = internal ?? alt;
      if (yt) {
        try { yt.unloadModule?.("captions"); } catch {}
        try { yt.unloadModule?.("cc"); } catch {}
        try { yt.setOption?.("captions", "track", {}); } catch {}
        try { yt.setOption?.("cc", "track", {}); } catch {}
      }
    } catch {}
    // Seek to startAtMs if provided
    if (typeof startAtMs === "number" && startAtMs > 0) {
      const secs = startAtMs / 1000;
      try {
        playerRef.current?.seekTo?.(secs, "seconds");
      } catch {
        // ignore seek failure before player ready
      }
      setCurrentMs(startAtMs);
      onTimeUpdate?.(startAtMs);
    }
  }, [startAtMs, onTimeUpdate]);
  const handleDuration = useCallback(
    (secs: number) => {
      if (typeof secs === "number" && !Number.isNaN(secs) && secs > 0) {
        const ms = Math.floor(secs * 1000);
        setDurationMsState(ms);
        onDuration?.(ms);
      }
    },
    [onDuration]
  );

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setEnded(false);
    startTimer();
    onPlay?.();
  }, [startTimer, onPlay]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    clearTimer();
    // One final update on pause
    const raw = playerRef.current?.getCurrentTime?.();
    if (typeof raw === "number" && !Number.isNaN(raw)) {
      const ms = Math.floor(raw * 1000);
      setCurrentMs(ms);
      onTimeUpdate?.(ms);
    }
    onPause?.();
  }, [clearTimer, onTimeUpdate, onPause]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setEnded(true);
    clearTimer();
    onEnded?.();
  }, [clearTimer, onEnded]);

  const handleReplay = useCallback(() => {
    try {
      playerRef.current?.seekTo?.(0, "seconds");
    } catch {
      // ignore seek failure
    }
    setCurrentMs(0);
    setEnded(false);
    setIsPlaying(true);
    onTimeUpdate?.(0);
    pokeControls();
  }, [onTimeUpdate, pokeControls]);

  const handleTogglePlay = useCallback(() => {
    if (ended) {
      handleReplay();
      return;
    }
    setIsPlaying((v) => !v);
  }, [ended, handleReplay]);

  const handleProgressBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!durationMsState) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      const clamped = Math.min(Math.max(fraction, 0), 1);
      const seekMs = clamped * durationMsState;
      try {
        playerRef.current?.seekTo?.(clamped, "fraction");
      } catch {
        // ignore seek failure
      }
      setCurrentMs(Math.floor(seekMs));
      setEnded(false);
      onTimeUpdate?.(Math.floor(seekMs));
    },
    [durationMsState, onTimeUpdate]
  );

  const seekBy = useCallback(
    (deltaMs: number) => {
      const raw = playerRef.current?.getCurrentTime?.();
      const base = typeof raw === "number" && !Number.isNaN(raw) ? Math.floor(raw * 1000) : currentMs;
      const total = durationMsState > 0 ? durationMsState : Number.POSITIVE_INFINITY;
      const next = Math.min(Math.max(base + deltaMs, 0), total);
      try {
        playerRef.current?.seekTo?.(next / 1000, "seconds");
      } catch {
        // ignore seek failure
      }
      setCurrentMs(Math.floor(next));
      setEnded(false);
      onTimeUpdate?.(Math.floor(next));
      pokeControls();
    },
    [currentMs, durationMsState, onTimeUpdate, pokeControls]
  );

  const setVolumeSlider = useCallback(
    (value01: number) => {
      const next = Math.min(Math.max(value01, 0), 1);
      setVolume(next);
      setMuted(next === 0);
      pokeControls();
    },
    [pokeControls]
  );

  // Tua bằng phím ←/→ kiểu YouTube khi video là chủ thể tương tác (đang focus).
  // Bỏ qua khi focus trong input (thanh volume) để không double-handle.
  const handleSurfaceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      const delta = arrowSeekDeltaMs(e.key);
      if (delta === null) return;
      e.preventDefault();
      seekBy(delta);
    },
    [seekBy]
  );

  const progressPct =
    durationMsState > 0 ? Math.min(Math.max((currentMs / durationMsState) * 100, 0), 100) : 0;

  return (
    <div className="w-full" data-testid="video-player">
      {/* Player surface — controls=0 để ẩn hoàn toàn nút CC/Settings của YouTube */}
      <div
        ref={containerRef}
        onMouseMove={pokeControls}
        onTouchStart={pokeControls}
        onContextMenu={(e) => e.preventDefault()}
        tabIndex={0}
        role="region"
        aria-label="Khung video — bấm để focus, phím ←/→ tua 5 giây kiểu YouTube"
        title="Bấm vào video để focus • ←/→ tua 5s"
        onKeyDown={handleSurfaceKeyDown}
        className={`relative aspect-video w-full overflow-hidden rounded-lg bg-black group focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-400 ${showControls ? "" : "cursor-none"}`}
      >
        <ReactPlayer
          ref={playerRef as unknown as React.Ref<unknown>}
          url={youtubeUrl}
          width="100%"
          height="100%"
          controls={false}
          playing={isPlaying}
          volume={volume}
          muted={muted}
          onReady={handleReady}
          onDuration={handleDuration}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          config={{
            youtube: {
              playerVars: {
                modestbranding: 1,
                rel: 0,
                playsinline: 1,
                cc_load_policy: 0,
                iv_load_policy: 3,
                controls: 0,
                disablekb: 0,
                fs: 0,
                hl: "ja",
              },
            },
          }}
        />
        {/* Che header YouTube gốc (title + channel) bằng dải đen mỏng, không hiện chữ. */}
        <div
          data-testid="video-title-mask"
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-[64px] bg-black sm:h-[72px]"
        />
        {/* Che logo/watermark + dải "video khác" đáy YouTube:
            dải đen kín toàn chiều ngang, luôn hiện kể cả khi thanh controls tự ẩn */}
        <div
          data-testid="video-logo-mask"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[42px] bg-black"
        />
        {/* Overlay phụ đề kiểu YouTube: nghỉ (ẩn controls) → đè LÊN TRÊN dải đen che logo;
            (z-20 cao hơn logo-mask z-10 nên dòng Việt không bị che);
            hover (hiện controls) → nhảy lên trên thanh điều khiển */}
        {showOverlay && overlayText && (
          <div
            data-testid="video-overlay-sub"
            className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6 text-center transition-[bottom] duration-200 ${
              showControls ? "bottom-24" : "bottom-1"
            }`}
            aria-live="polite"
          >
            <span
              className="inline-block max-w-full rounded bg-black/60 px-3 py-1 text-base font-bold leading-relaxed text-white sm:text-lg"
              style={{ textShadow: "0 1px 2px #000, 0 0 4px #000" }}
            >
              {(() => {
                // Sub cũ dính đuôi Việt chung dòng → tách: Nhật 1 dòng / Việt 1 dòng
                const stuck = splitTrailingVietnamese(overlayText);
                const vi = (overlayTranslation ?? "").trim() || stuck.vi;
                // Dòng thuần Việt → hiện nhỏ như bản dịch, không sub to
                if (isVietnameseOnly(stuck.jp)) {
                  return (
                    <>
                      <span className="text-xs font-medium text-white/85 sm:text-sm">{stuck.jp}</span>
                      {vi && (
                        <>
                          <br />
                          <span className="text-xs font-medium text-white/85 sm:text-sm">{vi}</span>
                        </>
                      )}
                    </>
                  );
                }
                return (
                  <>
                    {splitSpeakerSegments(stuck.jp).map((seg, i) => (
                      <Fragment key={i}>
                        {i > 0 && <br />}
                        {seg}
                      </Fragment>
                    ))}
                    {vi && (
                      <>
                        <br />
                        <span className="text-xs font-medium text-white/85 sm:text-sm">{vi}</span>
                      </>
                    )}
                  </>
                );
              })()}
            </span>
          </div>
        )}
        {/* Custom overlay controls — thay thế controls native, không có nút CC */}
        <button
          aria-label={isPlaying ? "Tạm dừng" : "Phát"}
          data-testid="custom-play-toggle"
          onClick={handleTogglePlay}
          className={`absolute inset-0 flex items-center justify-center transition-colors ${showControls ? "bg-black/0 group-hover:bg-black/20" : "bg-black/0"}`}
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition-opacity ${isPlaying ? (showControls ? "opacity-0 group-hover:opacity-100" : "opacity-0") : "opacity-100"}`}
          >
            {isPlaying ? "❚❚" : "▶"}
          </span>
        </button>
        {/* Bottom bar: tiến trình NẰM TRONG khung video + cụm nút điều khiển.
            Nền đen đặc để che watermark / dải "video khác" của YouTube phía sau. */}
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/95 to-black/30 px-3 pb-2 pt-6 transition-opacity duration-300 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {/* Thanh tiến trình trong khung */}
          <div
            data-testid="progress-container"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={durationMsState}
            aria-valuenow={currentMs}
            aria-label="Tiến trình video"
            className="group/bar relative h-1.5 w-full cursor-pointer rounded-full bg-white/25 transition-all hover:h-2.5"
            onClick={handleProgressBarClick}
          >
            <div
              data-testid="progress-fill"
              className="absolute left-0 top-0 h-full rounded-full bg-sakura-500 transition-[width] duration-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 sm:gap-2">
            <button
              aria-label={isPlaying ? "Tạm dừng" : "Phát"}
              onClick={handleTogglePlay}
              className="rounded bg-white/90 px-2 py-1 text-xs font-bold text-slate-900"
            >
              {isPlaying ? "II" : "▶"}
            </button>
            <button
              aria-label="Lùi 5 giây"
              title="Lùi 5 giây"
              onClick={() => seekBy(-5000)}
              className="rounded bg-white/20 px-2 py-1 text-xs font-bold text-white hover:bg-white/30"
            >
              −5s
            </button>
            <button
              aria-label="Tới 5 giây"
              title="Tới 5 giây"
              onClick={() => seekBy(5000)}
              className="rounded bg-white/20 px-2 py-1 text-xs font-bold text-white hover:bg-white/30"
            >
              +5s
            </button>
            <span className="whitespace-nowrap font-mono text-xs text-white">{formatMsDisplay(currentMs)} / {formatMsDisplay(durationMsState)}</span>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              {/* Âm lượng kiểu YouTube: loa + thanh kéo (hover để bung trên desktop) */}
              <div className="group/vol flex items-center gap-1.5">
                <button
                  aria-label={muted || volume === 0 ? "Bật tiếng" : "Tắt tiếng"}
                  title={muted || volume === 0 ? "Bật tiếng" : "Tắt tiếng (kéo thanh để chỉnh)"}
                  onClick={() => setMuted((m) => !m)}
                  className="rounded bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30"
                >
                  {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔈" : "🔊"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={muted ? 0 : Math.round(volume * 100)}
                  onChange={(e) => setVolumeSlider(Number(e.target.value) / 100)}
                  aria-label="Âm lượng"
                  title={`Âm lượng ${muted ? 0 : Math.round(volume * 100)}%`}
                  data-testid="volume-slider"
                  className="h-1 w-0 cursor-pointer appearance-none overflow-hidden rounded-full bg-white/25 opacity-0 transition-all duration-200 accent-white group-hover/vol:w-16 group-hover/vol:opacity-100 group-hover/vol:overflow-visible max-sm:w-16 max-sm:opacity-100 max-sm:overflow-visible [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                />
              </div>
              <button
                aria-label={showOverlay ? "Ẩn phụ đề trên video" : "Hiện phụ đề trên video"}
                title={showOverlay ? "Ẩn phụ đề trên video" : "Hiện phụ đề trên video"}
                onClick={() => setShowOverlay((v) => !v)}
                className={`rounded px-2 py-1 text-xs font-bold ${showOverlay ? "bg-white/90 text-slate-900" : "bg-white/20 text-white hover:bg-white/30"}`}
              >
                CC
              </button>
              <button
                aria-label="Toàn màn hình"
                onClick={() => {
                  const el = containerRef.current;
                  if (el?.requestFullscreen) el.requestFullscreen();
                }}
                className="rounded bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30"
              >
                ⛶
              </button>
            </div>
          </div>
        </div>
        {/* Màn hình kết thúc của web — che endscreen "video khác" + logo YouTube khi hết video */}
        {ended && (
          <div
            data-testid="video-ended-cover"
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black"
          >
            <p className="text-sm font-semibold text-white">Đã phát hết video</p>
            <button
              onClick={handleReplay}
              className="rounded-full bg-white px-5 py-2 text-sm font-bold text-slate-900 hover:bg-sakura-100"
            >
              ↻ Xem lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Format milliseconds to m:ss — exported domain helper for consistent time display
 * across player and history screens. Keep as named export so call sites share contract.
 */
export function formatMsDisplay(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
