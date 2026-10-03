"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { splitTrailingVietnamese } from "@/lib/bilingual";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const ReactPlayer = dynamic(() => import("react-player"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black text-xs text-slate-400">
      Đang tải trình phát...
    </div>
  ),
}) as unknown as ComponentType<Record<string, unknown>>;

export type SubtitleRow = {
  id: number | string;
  start_time_ms: number;
  end_time_ms: number;
  raw_text: string;
  translation?: string | null;
};

export type ShadowingPlayerProps = {
  subtitle: SubtitleRow;
  youtubeId: string;
  start_ms: number;
  end_ms: number;
  onClose?: () => void;
};

type PlayerHandle = {
  getCurrentTime: () => number;
  seekTo: (amount: number, type?: "seconds" | "fraction") => void;
  getInternalPlayer?: (host?: string) => unknown;
};

function formatMsShort(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ShadowingPlayer({
  subtitle,
  youtubeId,
  start_ms,
  end_ms,
  onClose,
}: ShadowingPlayerProps) {
  const effectiveStart = typeof start_ms === "number" && !Number.isNaN(start_ms) ? start_ms : subtitle.start_time_ms;
  const effectiveEnd = typeof end_ms === "number" && !Number.isNaN(end_ms) ? end_ms : subtitle.end_time_ms;
  const durationMs = Math.max(0, effectiveEnd - effectiveStart);
  // Sub dính đuôi Việt chung dòng → chỉ hiện Nhật, Việt xuống dòng dưới
  const subSplit = splitTrailingVietnamese(subtitle.raw_text);
  const subVi = (subtitle.translation ?? "").trim() || subSplit.vi;

  const playerRef = useRef<PlayerHandle | null>(null);
  const intervalRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(effectiveStart);
  // loop
  const [isLooping, setIsLooping] = useState(false);
  const [loopCount, setLoopCount] = useState(0); // 0..2 (3 lần)
  const MAX_LOOPS = 3;

  // playback rate
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  // recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordStartTs, setRecordStartTs] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [scoreFeedback, setScoreFeedback] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const recordedAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<number | null>(null);

  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  // Sync subtitle change -> reset state
  useEffect(() => {
    setCurrentMs(effectiveStart);
    setIsPlaying(false);
    setIsLooping(false);
    setLoopCount(0);
    setScore(null);
    setScoreFeedback(null);
    // keep recorded? reset on new subtitle? keep but clear to avoid confusion
    // Do not auto-clear recording; user may want to keep but we reset duration
    // We'll keep recorded but reset score
  }, [effectiveStart, effectiveEnd, subtitle.id]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // apply playbackRate via YT API
  const applyPlaybackRate = useCallback((rate: number) => {
    try {
      // try YT internal player
      const getInternal = (playerRef.current as unknown as { getInternalPlayer?: (h?: string) => unknown })?.getInternalPlayer;
      let yt: unknown = null;
      if (getInternal) {
        try {
          yt = (getInternal as (h?: string) => unknown)("youtube");
        } catch {}
        if (!yt) {
          try {
            yt = (getInternal as () => unknown)();
          } catch {}
        }
      }
      const y = yt as { setPlaybackRate?: (r: number) => void; setOption?: unknown; getPlaybackRate?: () => number } | null | undefined;
      if (y && typeof y.setPlaybackRate === "function") {
        y.setPlaybackRate(rate);
        return;
      }
      // fallback: try HTML5 video element inside
      const wrap = document.querySelector('[data-testid="shadowing-player"]');
      const video = wrap?.querySelector("video") as HTMLVideoElement | null;
      if (video) {
        video.playbackRate = rate;
      }
    } catch {}
  }, []);

  useEffect(() => {
    applyPlaybackRate(playbackRate);
  }, [playbackRate, applyPlaybackRate, isPlaying]);

  const startTimer = useCallback(() => {
    clearTimer();
    intervalRef.current = window.setInterval(() => {
      const raw = playerRef.current?.getCurrentTime?.();
      if (typeof raw === "number" && !Number.isNaN(raw)) {
        const ms = Math.floor(raw * 1000);
        // check end boundary with small tolerance
        if (ms >= effectiveEnd - 180) {
          if (isLooping) {
            if (loopCount < MAX_LOOPS - 1) {
              // replay
              try {
                playerRef.current?.seekTo(effectiveStart / 1000, "seconds");
              } catch {}
              setCurrentMs(effectiveStart);
              setLoopCount((c) => c + 1);
              // ensure still playing: keep isPlaying true, re-apply rate
              setTimeout(() => applyPlaybackRate(playbackRate), 50);
            } else {
              // finished 3 times
              try {
                playerRef.current?.seekTo(effectiveStart / 1000, "seconds");
              } catch {}
              setCurrentMs(effectiveStart);
              setIsPlaying(false);
              setIsLooping(false);
              setLoopCount(0);
              clearTimer();
            }
          } else {
            // single play: pause/loop back to start paused
            setIsPlaying(false);
            clearTimer();
            try {
              playerRef.current?.seekTo(effectiveStart / 1000, "seconds");
            } catch {}
            setCurrentMs(effectiveStart);
          }
        } else {
          setCurrentMs(ms);
        }
      }
    }, 180);
  }, [clearTimer, effectiveEnd, effectiveStart, isLooping, loopCount, applyPlaybackRate, playbackRate]);

  useEffect(() => {
    if (isPlaying) {
      startTimer();
    } else {
      clearTimer();
    }
    return () => clearTimer();
  }, [isPlaying, startTimer, clearTimer]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (durationIntervalRef.current) window.clearInterval(durationIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch {}
      }
      if (recordedUrl) {
        try { URL.revokeObjectURL(recordedUrl); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReady = useCallback(() => {
    // initial seek to start
    try {
      playerRef.current?.seekTo(effectiveStart / 1000, "seconds");
    } catch {}
    setCurrentMs(effectiveStart);
    // apply rate on ready
    setTimeout(() => applyPlaybackRate(playbackRate), 300);
  }, [effectiveStart, applyPlaybackRate, playbackRate]);

  const handlePlayToggle = useCallback(() => {
    if (!isPlaying) {
      // if current is near end, seek to start
      const raw = playerRef.current?.getCurrentTime?.();
      const cur = typeof raw === "number" ? Math.floor(raw * 1000) : currentMs;
      if (cur >= effectiveEnd - 300 || cur < effectiveStart - 200) {
        try { playerRef.current?.seekTo(effectiveStart / 1000, "seconds"); } catch {}
        setCurrentMs(effectiveStart);
      }
    }
    setIsPlaying((v) => !v);
  }, [isPlaying, currentMs, effectiveStart, effectiveEnd]);

  const handleLoop3 = useCallback(() => {
    // start looping 3 times
    setLoopCount(0);
    setIsLooping(true);
    try { playerRef.current?.seekTo(effectiveStart / 1000, "seconds"); } catch {}
    setCurrentMs(effectiveStart);
    setIsPlaying(true);
    setTimeout(() => applyPlaybackRate(playbackRate), 60);
  }, [effectiveStart, applyPlaybackRate, playbackRate]);

  const handleStopLoop = useCallback(() => {
    setIsLooping(false);
    setLoopCount(0);
    setIsPlaying(false);
    try { playerRef.current?.seekTo(effectiveStart / 1000, "seconds"); } catch {}
    setCurrentMs(effectiveStart);
  }, [effectiveStart]);

  const handleRate = useCallback((r: number) => {
    setPlaybackRate(r);
    // apply immediately if playing
    setTimeout(() => applyPlaybackRate(r), 30);
  }, [applyPlaybackRate]);

  // waveform draw
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const analyser = analyserRef.current;

    const draw = () => {
      if (!canvasRef.current) return;
      const c = canvasRef.current.getContext("2d");
      if (!c) return;
      c.clearRect(0, 0, width, height);
      // background
      c.fillStyle = "#fff1f5";
      c.fillRect(0, 0, width, height);

      if (analyser && isRecording) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        const bars = 32;
        const barWidth = (width / bars) * 0.7;
        const gap = (width / bars) * 0.3;
        let x = 0;
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * bufferLength);
          const v = dataArray[idx] ?? 0;
          const percent = v / 255;
          const barHeight = Math.max(4, percent * (height - 8));
          const y = (height - barHeight) / 2;
          // sakura gradient
          c.fillStyle = isRecording ? "#f472b6" : "#ffc8d6";
          // rounded bars
          c.beginPath();
          const radius = 3;
          const bx = x + gap / 2;
          c.moveTo(bx + radius, y);
          c.lineTo(bx + barWidth - radius, y);
          c.quadraticCurveTo(bx + barWidth, y, bx + barWidth, y + radius);
          c.lineTo(bx + barWidth, y + barHeight - radius);
          c.quadraticCurveTo(bx + barWidth, y + barHeight, bx + barWidth - radius, y + barHeight);
          c.lineTo(bx + radius, y + barHeight);
          c.quadraticCurveTo(bx, y + barHeight, bx, y + barHeight - radius);
          c.lineTo(bx, y + radius);
          c.quadraticCurveTo(bx, y, bx + radius, y);
          c.closePath();
          c.fill();
          x += barWidth + gap;
        }
        animationRef.current = requestAnimationFrame(draw);
      } else if (recordedUrl) {
        // static mock waveform for recorded audio
        const bars = 32;
        const barWidth = (width / bars) * 0.7;
        const gap = (width / bars) * 0.3;
        let x = 0;
        // generate deterministic pseudo-random based on recordedDurationMs
        const seed = Math.floor(recordingDurationMs || 1000);
        for (let i = 0; i < bars; i++) {
          const pseudo = Math.abs(Math.sin(seed * 0.001 + i * 0.9)) * 0.7 + 0.25;
          const barHeight = pseudo * (height - 8);
          const y = (height - barHeight) / 2;
          c.fillStyle = "#f472b6";
          c.fillRect(x + gap / 2, y, barWidth, barHeight);
          x += barWidth + gap;
        }
      } else {
        // idle: faint bars
        const bars = 32;
        const barWidth = (width / bars) * 0.7;
        const gap = (width / bars) * 0.3;
        let x = 0;
        for (let i = 0; i < bars; i++) {
          const h = 4 + Math.abs(Math.sin(Date.now() * 0.001 + i)) * 6;
          const y = (height - h) / 2;
          c.fillStyle = "#ffe4ec";
          c.fillRect(x + gap / 2, y, barWidth, h);
          x += barWidth + gap;
        }
        if (!isRecording && !recordedUrl) {
          animationRef.current = requestAnimationFrame(draw);
        }
      }
    };
    draw();
  }, [isRecording, recordedUrl, recordingDurationMs]);

  useEffect(() => {
    // start idle animation on mount
    drawWaveform();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [drawWaveform]);

  useEffect(() => {
    if (isRecording) {
      drawWaveform();
    }
  }, [isRecording, drawWaveform]);

  const startRecording = useCallback(async () => {
    setErrorMsg(null);
    setScore(null);
    setScoreFeedback(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("Trình duyệt không hỗ trợ ghi âm (mediaDevices).");
      return;
    }
    try {
      // cleanup previous url
      if (recordedUrl) {
        try { URL.revokeObjectURL(recordedUrl); } catch {}
        setRecordedUrl(null);
        setRecordedBlob(null);
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      // audio context for waveform
      const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          setRecordedBlob(blob);
          const url = URL.createObjectURL(blob);
          setRecordedUrl(url);
          // stop stream tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          try { ctx.close(); } catch {}
          analyserRef.current = null;
          audioCtxRef.current = null;
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
          // final duration
          if (recordStartTs) {
            const dur = Date.now() - recordStartTs;
            setRecordingDurationMs(dur);
          }
        } catch (err) {
          setErrorMsg(String(err));
        }
        setIsRecording(false);
        if (durationIntervalRef.current) {
          window.clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      };

      const startTs = Date.now();
      setRecordStartTs(startTs);
      setRecordingDurationMs(0);
      setIsRecording(true);
      // duration ticker
      if (durationIntervalRef.current) window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = window.setInterval(() => {
        setRecordingDurationMs(Date.now() - startTs);
      }, 120);
      mr.start(100);
      // start waveform animation
      setTimeout(() => drawWaveform(), 30);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg("Không thể truy cập micro: " + msg);
      setIsRecording(false);
    }
  }, [recordedUrl, recordStartTs, drawWaveform]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      } else {
        setIsRecording(false);
        if (durationIntervalRef.current) {
          window.clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
      }
    } catch (e) {
      setErrorMsg(String(e));
      setIsRecording(false);
    }
  }, []);

  const handleScore = useCallback(() => {
    if (!recordedBlob) {
      setErrorMsg("Bạn cần ghi âm trước khi chấm điểm.");
      return;
    }
    const originalDur = durationMs;
    const recordedDur = recordingDurationMs || 0;
    if (originalDur <= 0 || recordedDur <= 0) {
      setScore(0);
      setScoreFeedback("Không đủ dữ liệu độ dài để chấm.");
      return;
    }
    const ratio = Math.min(originalDur, recordedDur) / Math.max(originalDur, recordedDur);
    let sc = Math.round(ratio * 100);
    // clamp 0-100
    sc = Math.max(0, Math.min(100, sc));
    setScore(sc);
    let fb = "";
    if (sc >= 90) fb = "Tuyệt vời! Độ dài rất khớp với câu gốc. Phát âm trôi chảy 🌸";
    else if (sc >= 75) fb = "Khá tốt — thử điều chỉnh tốc độ nói cho khớp hơn.";
    else if (sc >= 55) fb = "Cần luyện thêm — chú ý ngắt nghỉ và độ dài câu.";
    else fb = "Độ dài chênh lệch nhiều — hãy thử lại chậm hơn, nghe kỹ rồi nhại theo.";
    // Add detail
    const diffSec = Math.abs(originalDur - recordedDur) / 1000;
    fb += ` (gốc ${ (originalDur/1000).toFixed(2)}s • bạn ${ (recordedDur/1000).toFixed(2)}s • lệch ${diffSec.toFixed(2)}s)`;
    setScoreFeedback(fb);
  }, [recordedBlob, durationMs, recordingDurationMs]);

  const handleReplayRecorded = useCallback(() => {
    if (recordedAudioRef.current) {
      recordedAudioRef.current.currentTime = 0;
      recordedAudioRef.current.play().catch(()=>{});
    }
  }, []);

  const handleReplayOriginal = useCallback(() => {
    // replay original segment once (without loop)
    setIsLooping(false);
    setLoopCount(0);
    try { playerRef.current?.seekTo(effectiveStart/1000, "seconds"); } catch {}
    setCurrentMs(effectiveStart);
    setIsPlaying(true);
  }, [effectiveStart]);

  // ensure canvas size is correct for hidpi
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      // need to reset style size
      // but width/height already set; css keeps rect
    }
  }, [recordedUrl, isRecording]);

  return (
    <div
      data-testid="shadowing-player"
      className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sakura-500 text-white text-xs">🎙</span>
            Luyện Shadowing
            {isLooping && (
              <span className="rounded-full bg-sakura-100 border border-sakura-200 px-2 py-0.5 text-[11px] font-bold text-sakura-700">
                Lặp {loopCount + 1}/{MAX_LOOPS}
              </span>
            )}
          </h3>
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-700">{subSplit.jp}</p>
          {subVi && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{subVi}</p>
          )}
          <p className="mt-1 text-xs font-mono text-sakura-500">
            {formatMsShort(effectiveStart)} — {formatMsShort(effectiveEnd)} • {(durationMs/1000).toFixed(2)}s
          </p>
        </div>
        {onClose && (
          <button
            aria-label="Đóng"
            data-testid="shadowing-close"
            onClick={onClose}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            ✕
          </button>
        )}
      </div>

      {/* Mini YouTube player */}
      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
        <ReactPlayer
          ref={playerRef as unknown as React.Ref<unknown>}
          url={youtubeUrl}
          width="100%"
          height="100%"
          controls={false}
          playing={isPlaying}
          onReady={handleReady}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            // fallback if not looping
            if (!isLooping) {
              setIsPlaying(false);
              try { playerRef.current?.seekTo(effectiveStart/1000, "seconds"); } catch {}
              setCurrentMs(effectiveStart);
            }
          }}
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
        {/* Ẩn tên video YouTube gốc trong khung shadowing */}
        <div
          data-testid="shadowing-title-mask"
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-[48px] bg-black"
        />
        {/* Che logo YouTube đáy — dải kín toàn chiều ngang */}
        <div
          data-testid="shadowing-logo-mask"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[38px] bg-black"
        />
        {/* overlay play toggle */}
        <button
          aria-label={isPlaying ? "Tạm dừng" : "Phát"}
          data-testid="shadowing-play-toggle"
          onClick={handlePlayToggle}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors group"
        >
          <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition-opacity ${isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
            {isPlaying ? "❚❚" : "▶"}
          </span>
        </button>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/95 to-black/30 px-3 py-2 flex items-center gap-2">
          <span className="font-mono text-xs text-white">{formatMsShort(currentMs - effectiveStart)} / {formatMsShort(durationMs)}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${isPlaying ? "bg-emerald-400 animate-pulse" : "bg-white/50"}`} />
            <span className="text-[11px] text-white/80">{isPlaying ? "Đang phát" : "Tạm dừng"}</span>
          </div>
        </div>
      </div>

      {/* Progress bar for segment */}
      <div className="mt-2 h-1.5 w-full rounded-full bg-sakura-100 overflow-hidden">
        <div
          className="h-full bg-sakura-500 transition-[width] duration-150"
          style={{ width: `${durationMs>0 ? Math.min(100, Math.max(0, ((currentMs - effectiveStart)/durationMs)*100)) : 0}%`}}
        />
      </div>

      {/* Loop + playbackRate controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!isLooping ? (
          <button
            data-testid="shadowing-loop"
            onClick={handleLoop3}
            className="rounded-full bg-sakura-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sakura-600"
          >
            🔁 Lặp 3 lần
          </button>
        ) : (
          <button
            data-testid="shadowing-loop-stop"
            onClick={handleStopLoop}
            className="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600"
          >
            ■ Dừng lặp ({loopCount+1}/{MAX_LOOPS})
          </button>
        )}
        <button
          data-testid="shadowing-play-once"
          onClick={handleReplayOriginal}
          className="rounded-full border border-sakura-200 bg-white px-3 py-2 text-xs font-bold text-sakura-700 hover:bg-sakura-50"
        >
          ▶ Phát 1 lần
        </button>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-sakura-200 bg-sakura-50 p-1">
          {[0.5, 0.75, 1].map((r) => (
            <button
              key={r}
              data-testid={`shadowing-rate-${String(r).replace('.', '-')}`}
              onClick={() => handleRate(r)}
              className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${playbackRate===r ? "bg-sakura-500 text-white shadow-sm" : "text-sakura-700 hover:bg-white"}`}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">Tốc độ qua <code>playerRef</code> • YT setPlaybackRate • HTML5 fallback</p>

      {/* Recording section */}
      <div className="mt-4 rounded-xl border border-sakura-200 bg-sakura-50/50 p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-700">Thu âm & Waveform</h4>
          {isRecording && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white animate-pulse">
              <span className="h-2 w-2 rounded-full bg-white" /> REC {formatMsShort(recordingDurationMs)}
            </span>
          )}
          {!isRecording && recordedUrl && (
            <span className="text-xs font-mono text-sakura-600">{formatMsShort(recordingDurationMs)} đã ghi</span>
          )}
        </div>

        <div className="mt-2 overflow-hidden rounded-lg border border-sakura-200 bg-white">
          <canvas
            ref={canvasRef}
            data-testid="shadowing-waveform"
            width={320}
            height={64}
            className="h-16 w-full block"
            style={{ width: "100%", height: "64px" }}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {!isRecording ? (
            <button
              data-testid="shadowing-record"
              onClick={startRecording}
              className="rounded-full bg-red-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-600"
            >
              ● Ghi âm
            </button>
          ) : (
            <button
              data-testid="shadowing-record-stop"
              onClick={stopRecording}
              className="rounded-full bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-900"
            >
              ■ Dừng
            </button>
          )}
          <button
            data-testid="shadowing-replay-recorded"
            onClick={handleReplayRecorded}
            disabled={!recordedUrl}
            className={`rounded-full border px-3 py-2 text-xs font-bold ${recordedUrl ? "border-sakura-200 bg-white text-sakura-700 hover:bg-sakura-50" : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"}`}
          >
            ▶ Phát lại ghi âm
          </button>
          <button
            data-testid="shadowing-replay-original"
            onClick={handleReplayOriginal}
            className="rounded-full border border-sakura-200 bg-white px-3 py-2 text-xs font-bold text-sakura-700 hover:bg-sakura-50"
          >
            ▶ Phát gốc
          </button>
          <button
            data-testid="shadowing-score"
            onClick={handleScore}
            disabled={!recordedBlob}
            className={`ml-auto rounded-full px-4 py-2 text-xs font-bold shadow-sm ${recordedBlob ? "bg-sakura-500 text-white hover:bg-sakura-600" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
          >
            Chấm điểm
          </button>
        </div>

        {recordedUrl && (
          <audio
            ref={recordedAudioRef}
            data-testid="shadowing-audio"
            src={recordedUrl}
            controls
            className="mt-3 w-full"
          />
        )}

        {errorMsg && (
          <p data-testid="shadowing-error" className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
        )}

        {score !== null && (
          <div data-testid="shadowing-score-result" className="mt-3 rounded-xl border border-sakura-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">Điểm: {score}/100</span>
              <div className="flex-1 h-2 rounded-full bg-sakura-100 overflow-hidden">
                <div className="h-full bg-sakura-500 transition-all" style={{ width: `${score}%` }} />
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${score>=80 ? "bg-emerald-100 text-emerald-700" : score>=60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                {score>=90 ? "Xuất sắc" : score>=75 ? "Khá tốt" : score>=55 ? "Trung bình" : "Cần luyện"}
              </span>
            </div>
            {scoreFeedback && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{scoreFeedback}</p>}
            <p className="mt-1 text-[11px] text-slate-400">Mock chấm điểm: so sánh độ dài ghi âm vs câu gốc (original {(durationMs/1000).toFixed(2)}s vs bạn {(recordingDurationMs/1000).toFixed(2)}s)</p>
          </div>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Dùng <code>navigator.mediaDevices.getUserMedia</code> + <code>MediaRecorder</code> • Waveform qua <code>AnalyserNode</code> canvas bars • Phát lại so sánh • Mock chấm điểm theo độ dài
        </p>
      </div>
    </div>
  );
}
