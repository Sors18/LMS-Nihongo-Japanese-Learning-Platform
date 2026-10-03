"use client";

import { useRef, useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveKanjiAttempt } from "@/app/actions/kanjiProgress";

export type KanjiItem = {
  kanji: string;
  reading?: string;
  meaning?: string;
  sampleWord?: string;
  level?: string;
};

const KANJI_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

type Props = {
  kanjiList: KanjiItem[];
  progressMap?: Record<string, { attempts: number; mastered: boolean }>;
  selectedLevel?: string | null;
  onLevelChange?: (level: string | null) => void;
};

function getCanvasPos(
  e: MouseEvent | TouchEvent,
  canvas: HTMLCanvasElement
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  let clientX: number;
  let clientY: number;
  if ("touches" in e) {
    const t = e.touches[0] ?? e.changedTouches?.[0];
    if (!t) return null;
    clientX = t.clientX;
    clientY = t.clientY;
  } else {
    clientX = (e as MouseEvent).clientX;
    clientY = (e as MouseEvent).clientY;
  }
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export default function KanjiCanvas({ kanjiList, progressMap, selectedLevel, onLevelChange }: Props) {
  const fallback: KanjiItem[] = [
    { kanji: "耳", reading: "みみ", meaning: "tai", sampleWord: "耳", level: "N5" },
    { kanji: "見", reading: "みる", meaning: "nhìn", sampleWord: "見る", level: "N5" },
    { kanji: "学", reading: "がく", meaning: "học", sampleWord: "学校", level: "N5" },
    { kanji: "水", reading: "みず", meaning: "nước", sampleWord: "水", level: "N5" },
    { kanji: "日", reading: "ひ", meaning: "ngày", sampleWord: "日本", level: "N5" },
    { kanji: "本", reading: "ほん", meaning: "sách", sampleWord: "本", level: "N5" },
  ];

  const router = useRouter() as unknown as { push: (href: string, opts?: { scroll: boolean }) => void };
  const searchParams = useSearchParams() as unknown as URLSearchParams;

  const activeLevelRaw = selectedLevel !== undefined ? selectedLevel : searchParams.get("level");
  const normalizedActive: string | null =
    activeLevelRaw && (KANJI_LEVELS as readonly string[]).includes(activeLevelRaw) ? activeLevelRaw : null;

  const handleLevelChange = useCallback(
    (level: string | null) => {
      if (onLevelChange) {
        onLevelChange(level);
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      if (!level) params.delete("level");
      else params.set("level", level);
      const qs = params.toString();
      router.push(qs ? `/kanji?${qs}` : "/kanji", { scroll: false });
    },
    [onLevelChange, searchParams, router]
  );

  const effectiveFallback = normalizedActive ? fallback.filter((k) => k.level === normalizedActive) : fallback;
  const list = kanjiList.length > 0 ? kanjiList : effectiveFallback;

  const [selected, setSelected] = useState(0);
  const current = list[selected] ?? list[0];
  const progress = current ? progressMap?.[current.kanji] : undefined;

  useEffect(() => {
    setSelected(0);
  }, [normalizedActive]);

  useEffect(() => {
    if (selected >= list.length && list.length > 0) setSelected(0);
  }, [selected, list.length]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [checkOk, setCheckOk] = useState<boolean | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [masteredChecked, setMasteredChecked] = useState(false);
  const [isPending, startTransition] = useTransition();

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 280;
    canvas.height = 280;
    canvas.style.width = "280px";
    canvas.style.height = "280px";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1e293b";
    ctx.clearRect(0, 0, 280, 280);
  }, []);

  // Clear helper
  // Clear helper
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 280, 280);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1e293b";
    setHasDrawn(false);
    setCheckMsg(null);
    setCheckOk(null);
    setSaveMsg(null);
    lastPosRef.current = null;
  }, []);

  useEffect(() => {
    setupCanvas();
    setHasDrawn(false);
    setCheckMsg(null);
    setCheckOk(null);
    setSaveMsg(null);
    setMasteredChecked(progress?.mastered ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, setupCanvas]);

  // resize observer for dpr changes? not needed
  useEffect(() => {
    setupCanvas();
    const handleResize = () => setupCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setupCanvas]);

  const startDraw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasPos(e.nativeEvent as unknown as MouseEvent, canvas);
      if (!pos) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      isDrawingRef.current = true;
      lastPosRef.current = pos;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      setHasDrawn(true);
      setCheckMsg(null);
      setCheckOk(null);
    },
    []
  );

  const moveDraw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasPos(e.nativeEvent as unknown as MouseEvent, canvas);
      if (!pos) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const last = lastPosRef.current;
      if (!last) {
        lastPosRef.current = pos;
        return;
      }
      const midX = (last.x + pos.x) / 2;
      const midY = (last.y + pos.y) / 2;
      ctx.quadraticCurveTo(last.x, last.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      lastPosRef.current = pos;
      setHasDrawn(true);
    },
    []
  );

  const endDraw = useCallback(
    (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (e) e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (isDrawingRef.current && lastPosRef.current) {
        // finish stroke
        const last = lastPosRef.current;
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        ctx.beginPath();
      }
      isDrawingRef.current = false;
      lastPosRef.current = null;
    },
    []
  );

  const handleCheck = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      const currentKanji = current.kanji;
      // Tạo canvas tham chiếu ẩn để so sánh
      const refCanvas = document.createElement("canvas");
      refCanvas.width = 280;
      refCanvas.height = 280;
      const refCtx = refCanvas.getContext("2d");
      if (!refCtx) {
        setCheckMsg("Không thể kiểm tra — thử lại nhé");
        setCheckOk(false);
        return;
      }
      // Vẽ Kanji mẫu tham chiếu giống faint background nhưng nét đậm đen để so sánh
      refCtx.clearRect(0, 0, 280, 280);
      refCtx.fillStyle = "#ffffff";
      refCtx.fillRect(0, 0, 280, 280);
      refCtx.fillStyle = "#000000";
      refCtx.font = "bold 180px 'Noto Sans JP', 'Hiragino Sans', sans-serif";
      refCtx.textAlign = "center";
      refCtx.textBaseline = "middle";
      refCtx.fillText(currentKanji, 140, 140);

      const drawnData = ctx.getImageData(0, 0, 280, 280).data;
      const refData = refCtx.getImageData(0, 0, 280, 280).data;

      // Đếm pixel mực (alpha >20 và màu tối) — canvas user nền trong suốt, nên chỉ nét vẽ có alpha
      let drawnInk = 0;
      let refInk = 0;
      const drawnSet = new Set<string>();
      // Lấy vị trí mực đã vẽ
      for (let y = 0; y < 280; y++) {
        for (let x = 0; x < 280; x++) {
          const idx = (y * 280 + x) * 4;
          const aDrawn = drawnData[idx + 3];
          const rDrawn = drawnData[idx];
          const gDrawn = drawnData[idx + 1];
          const bDrawn = drawnData[idx + 2];
          const isDrawnInk = aDrawn > 20 && rDrawn < 100 && gDrawn < 100 && bDrawn < 100;
          if (isDrawnInk) {
            drawnInk++;
            drawnSet.add(`${x},${y}`);
          }
          const aRef = refData[idx + 3];
          const rRef = refData[idx];
          if (aRef > 20 && rRef < 50) refInk++;
        }
      }

      if (drawnInk < 80 && !hasDrawn) {
        setCheckMsg("Bạn chưa vẽ nét nào. Hãy thử vẽ Kanji mẫu nhé ✍️");
        setCheckOk(false);
        return;
      }
      if (drawnInk < 80) {
        setCheckMsg("Nét vẽ quá mờ/ít. Hãy vẽ đậm và đầy đủ các nét nhé ✍️");
        setCheckOk(false);
        return;
      }
      if (refInk < 10) {
        setCheckMsg("Không thể so sánh mẫu — thử lại nhé");
        setCheckOk(false);
        return;
      }
      // Tính độ khớp: với mỗi pixel mẫu, có vẽ trong vòng bán kính 8px không
      let matched = 0;
      const radius = 8;
      // Tạo lookup nhanh: với mỗi ref pixel, check 5x5 lân cận
      for (let y = 0; y < 280; y++) {
        for (let x = 0; x < 280; x++) {
          const idx = (y * 280 + x) * 4;
          const aRef = refData[idx + 3];
          const rRef = refData[idx];
          if (!(aRef > 20 && rRef < 50)) continue;
          let found = false;
          for (let dy = -radius; dy <= radius && !found; dy++) {
            for (let dx = -radius; dx <= radius && !found; dx++) {
              if (Math.abs(dx) + Math.abs(dy) > radius + 2) continue;
              if (drawnSet.has(`${x + dx},${y + dy}`)) found = true;
            }
          }
          if (found) matched++;
        }
      }
      const matchRatio = matched / refInk;
      const extraRatio = drawnInk / refInk;
      const matchPercent = Math.round(matchRatio * 100);

      if (matchRatio < 0.35) {
        setCheckMsg(`Chưa đúng rồi — độ khớp chỉ ${matchPercent}%. Hãy vẽ theo nét mờ màu hồng phía sau nhé. Viết lại từ từ theo thứ tự nét ✍️`);
        setCheckOk(false);
      } else if (matchRatio < 0.55) {
        setCheckMsg(`Gần đúng ${matchPercent}% — còn thiếu nét hoặc lệch vị trí. Thử căn giữa và vẽ đủ các nét nhé 🌸`);
        setCheckOk(false);
      } else if (extraRatio > 2.2) {
        setCheckMsg(`Nét vẽ hơi đậm/loang (${Math.round(extraRatio * 100)}% so với mẫu). Hãy xóa và vẽ lại mảnh hơn, đúng khung nhé ✍️`);
        setCheckOk(false);
      } else if (matchRatio < 0.7) {
        setCheckMsg(`Khá tốt ${matchPercent}% — gần chuẩn rồi! Chỉnh lại chút nữa rồi nhấn Lưu nhé 🌸`);
        setCheckOk(true);
      } else {
        setCheckMsg(`Tuyệt vời! Nét vẽ khớp ${matchPercent}% với mẫu. Nhấn Lưu để ghi lại tiến độ 🌸`);
        setCheckOk(true);
      }
    } catch {
      if (!hasDrawn) {
        setCheckMsg("Bạn chưa vẽ nét nào. Hãy thử vẽ Kanji mẫu nhé ✍️");
        setCheckOk(false);
      } else {
        setCheckMsg("Tuyệt! Bạn đã vẽ. So sánh với mẫu mờ phía sau nhé 🌸");
        setCheckOk(true);
      }
    }
  }, [hasDrawn, current.kanji]);
  const handleSave = useCallback(() => {
    if (!current) return;
    setSaveMsg(null);
    startTransition(async () => {
      const res = await saveKanjiAttempt(current.kanji, masteredChecked);
      if (res.ok) {
        setSaveMsg(`Đã lưu "${current.kanji}" — lần ${res.progress?.attempts ?? "?"} ${res.progress?.mastered ? "• đã thuộc ★" : ""}`);
      } else {
        setSaveMsg(res.error ?? "Lưu thất bại");
      }
    });
  }, [current, masteredChecked]);

  if (!current) {
    return (
      <div className="space-y-4">
        {/* Level filter pills - sakura active */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleLevelChange(null)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              normalizedActive === null
                ? "bg-sakura-500 text-white border-sakura-500 shadow-sm"
                : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
            }`}
          >
            Tất cả
          </button>
          {KANJI_LEVELS.map((lv) => {
            const isActive = normalizedActive === lv;
            return (
              <button
                key={lv}
                onClick={() => handleLevelChange(lv)}
                className={`rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide transition-colors ${
                  isActive
                    ? "bg-sakura-500 border-sakura-500 text-white shadow-sm"
                    : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
                }`}
              >
                {lv}
              </button>
            );
          })}
        </div>
        <div className="rounded-xl border border-dashed border-sakura-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-sm text-slate-700">Chưa có Kanji nào.</p>
          {normalizedActive && (
            <p className="mt-1 text-xs text-slate-500">Không có Kanji cho {normalizedActive}. Thử chọn Tất cả.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Level filter pills - 6 pills Tất cả/N5..N1 sakura active, router push scroll:false */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleLevelChange(null)}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
            normalizedActive === null
              ? "bg-sakura-500 text-white border-sakura-500 shadow-sm"
              : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
          }`}
        >
          Tất cả
        </button>
        {KANJI_LEVELS.map((lv) => {
          const isActive = normalizedActive === lv;
          return (
            <button
              key={lv}
              onClick={() => handleLevelChange(lv)}
              className={`rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide transition-colors ${
                isActive
                  ? "bg-sakura-500 border-sakura-500 text-white shadow-sm"
                  : "border-sakura-200 bg-white text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
              }`}
            >
              {lv}
            </button>
          );
        })}
      </div>

      {/* Kanji selector - sakura pills like FlashcardDeck */}
      <div className="flex flex-wrap gap-2">
        {list.map((k, idx) => {
          const isActive = idx === selected;
          const prog = progressMap?.[k.kanji];
          return (
            <button
              key={`${k.kanji}-${idx}`}
              onClick={() => setSelected(idx)}
              className={`relative rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                isActive
                  ? "bg-sakura-500 border-sakura-500 text-white shadow-sm"
                  : "bg-white border-sakura-200 text-slate-600 hover:bg-sakura-50 hover:text-sakura-700"
              }`}
              title={`${k.kanji} ${k.reading ?? ""} ${k.meaning ?? ""}`}
            >
              <span className="text-base">{k.kanji}</span>
              {k.reading && <span className="ml-1 text-[11px] opacity-80">{k.reading}</span>}
              {prog?.mastered && (
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                  ✓
                </span>
              )}
              {prog && !prog.mastered && prog.attempts > 0 && (
                <span className="ml-1 rounded-full bg-sakura-100 px-1.5 py-0.5 text-[10px] text-sakura-700 border border-sakura-200">
                  {prog.attempts}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Canvas card */}
        <div className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Bảng viết</h3>
            <span className="rounded-full bg-sakura-50 border border-sakura-200 px-2.5 py-0.5 text-[11px] font-medium text-sakura-700">
              280 × 280
            </span>
          </div>

          <div className="relative mx-auto h-[280px] w-[280px] overflow-hidden rounded-xl border border-sakura-200 bg-white shadow-inner">
            {/* faint kanji background */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
              <span
                className="font-bold leading-none text-sakura-100/80"
                style={{ fontSize: "180px", fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif" }}
                aria-hidden
              >
                {current.kanji}
              </span>
            </div>
            {/* subtle grid */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-full w-px bg-sakura-100/60" />
              <div className="absolute top-1/2 left-0 h-px w-full bg-sakura-100/60" />
              <div className="absolute inset-2 rounded-lg border border-dashed border-sakura-100/60" />
            </div>
            <canvas
              ref={canvasRef}
              width={280}
              height={280}
              className="relative h-[280px] w-[280px] touch-none cursor-crosshair"
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={clearCanvas}
              className="rounded-full border border-sakura-200 bg-white px-5 py-2 text-sm font-bold text-slate-600 hover:bg-sakura-50 hover:text-sakura-700 shadow-sm transition"
            >
              Xóa
            </button>
            <button
              onClick={handleCheck}
              className="rounded-full border border-amber-200 bg-amber-50 px-5 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100 transition"
            >
              Kiểm tra
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-full bg-sakura-500 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-sakura-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isPending ? "Đang lưu…" : "Lưu"}
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={masteredChecked}
              onChange={(e) => setMasteredChecked(e.target.checked)}
              className="h-4 w-4 rounded border-sakura-300 text-sakura-500 focus:ring-sakura-400"
            />
            Đánh dấu đã thuộc
          </label>

          {checkMsg && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                checkOk ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              {checkMsg}
            </div>
          )}
          {saveMsg && (
            <div className="mt-2 rounded-lg border border-sakura-200 bg-sakura-50 px-3 py-2 text-xs text-sakura-700">
              {saveMsg}
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-sakura-200 bg-white p-5 shadow-sm">
            <div className="flex gap-5 items-start">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-sakura-200 bg-sakura-50 text-5xl font-bold text-slate-800 shadow-inner">
                {current.kanji}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold text-slate-800">{current.kanji}</h2>
                {current.reading && <p className="mt-1 text-sm text-sakura-600">Âm: {current.reading}</p>}
                {current.meaning && <p className="mt-1 text-sm text-slate-700">{current.meaning}</p>}
                {current.sampleWord && current.sampleWord !== current.kanji && (
                  <p className="mt-1 text-xs text-slate-500">
                    Từ mẫu: <span className="font-medium text-slate-700">{current.sampleWord}</span>
                  </p>
                )}
                {current.level && (
                  <p className="mt-1 text-xs">
                    <span className="rounded-full bg-white border border-sakura-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      Cấp {current.level}
                    </span>
                  </p>
                )}
                {progress && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white border border-sakura-200 px-2.5 py-1 text-slate-600">
                      Đã luyện: <span className="font-bold text-slate-800">{progress.attempts}</span> lần
                    </span>
                    {progress.mastered ? (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 font-bold text-emerald-700">
                        ★ Đã thuộc
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-700">Chưa thuộc</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-sakura-50 border border-sakura-200 p-3">
              <p className="text-xs font-bold text-sakura-700">Mẹo luyện nét</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Vẽ đè lên chữ mờ trong khung 280×280. Dùng chuột hoặc ngón tay. Nét vẽ có làm mịn tự động — giữ chuột và kéo đều tay. Nhấn Kiểm tra để đánh giá, Lưu để ghi tiến độ.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-sakura-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800">Danh sách Kanji từ từ vựng</h3>
            <p className="mt-1 text-xs text-slate-500">
              Trích từ Vocabulary where word chứa Hán tự — nhóm theo từng chữ Kanji. {list.length} chữ.
            </p>
            <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {list.map((k, idx) => (
                <button
                  key={`grid-${k.kanji}-${idx}`}
                  onClick={() => setSelected(idx)}
                  className={`rounded-xl border p-3 text-center transition ${
                    idx === selected
                      ? "bg-sakura-500 border-sakura-500 text-white shadow-sm"
                      : "bg-white border-sakura-200 hover:bg-sakura-50"
                  }`}
                >
                  <div className={`text-xl font-bold ${idx === selected ? "text-white" : "text-slate-800"}`}>{k.kanji}</div>
                  <div className={`mt-0.5 text-[11px] truncate ${idx === selected ? "text-white/90" : "text-slate-500"}`}>
                    {k.reading ?? k.meaning ?? k.sampleWord ?? "—"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
