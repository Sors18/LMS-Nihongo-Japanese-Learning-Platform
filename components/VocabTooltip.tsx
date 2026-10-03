"use client";

import { useEffect, useState, useLayoutEffect, useRef } from "react";
import { createFlashcard } from "@/app/actions/flashcard";
import { lookupVocab } from "@/app/actions/vocab";
import VocabQuickEdit from "@/components/VocabQuickEdit";
import VocabReportButton from "@/components/VocabReportButton";
import { normalizeMeaningVi, formatReading } from "@/lib/meaningVi";
import { getProperNounKind, buildProperNounMeaning, parseProperKindFromMeaning } from "@/lib/vocabFilter";
import { getKnownProperReading, buildKnownProperMeaning } from "@/lib/properNames";
import type { ProperNounKind } from "@/lib/vocabFilter";

type Token = {
  surface_form: string;
  reading?: string;
  pos?: string;
  basic_form?: string;
  word?: string;
  basic?: string;
  pos_detail?: string;
  pos_sub?: string;
};

type Vocab = {
  id: number;
  word: string;
  reading: string;
  meaning: string;
  level: string;
};

function normalizeToken(t: Token) {
  const surface = t.surface_form ?? t.word ?? "";
  const reading = t.reading ?? surface;
  const basic = t.basic_form ?? t.basic ?? surface;
  const pos = t.pos ?? "";
  return { surface, reading, basic, pos };
}

/** Token tên riêng rõ ràng (kuromoji 固有名詞: 憂太, Pekora…) — nghĩa cố định, không đoán AI. */
function detectProperKind(t: Token): ProperNounKind | null {
  try {
    return getProperNounKind({ pos: t.pos, pos_detail: t.pos_detail, pos_sub: t.pos_sub, surface_form: t.surface_form ?? t.word, basic_form: t.basic_form ?? t.basic });
  } catch {
    return null;
  }
}

/** Token trông như tên kanji gộp (乙骨: 2-4 kanji, không kana) — gợi ý lookup tra kỹ tên riêng. */
function isKanjiNameLike(surface: string): boolean {
  const s = (surface ?? "").trim();
  if (s.length < 2 || s.length > 4) return false;
  return /^[\u4E00-\u9FFF々]+$/.test(s);
}

// Reading chuẩn: từ katakana giữ katakana, còn lại hiragana
// (dùng formatReading chung từ lib/meaningVi).
// Cache client theo từ — hover lại hiện ngay, kể cả từ không có nghĩa (cache null
// để khỏi fetch lặp). Map module-level, sống suốt session.
const vocabCache = new Map<string, Vocab | null>();

/** Xóa cache tooltip của 1 từ — gọi sau khi ADMIN sửa để hover sau hiện bản mới. */
export function evictTooltipVocabCache(word: string): void {
  const w = (word ?? "").trim();
  if (!w) return;
  for (const k of [...vocabCache.keys()]) {
    if (k === `vocab:word:${w}` || k.startsWith(`vocab:word:${w}:`) || k.startsWith(`vocab:wr:${w}:`)) {
      vocabCache.delete(k);
    }
  }
}

async function fetchOneUncached(word: string, sample?: string | null): Promise<Vocab | null> {
  try {
    const v = await lookupVocab(word, { sample });
    if (v) return v as Vocab;
  } catch {
    // ignore → thử fetch API
  }
  try {
    const params = new URLSearchParams({ word });
    if (sample) params.set("sample", sample.slice(0, 300));
    const res = await fetch(`/api/vocab?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.found && data.vocab) return data.vocab as Vocab;
    }
  } catch {
    // ignore
  }
  return null;
}

function lookupWords(surface: string, basic: string): string[] {
  const words = surface === basic ? [surface] : [surface, basic];
  return words.filter((w) => !!w);
}

async function resolveVocab(surface: string, basic: string, sample?: string | null): Promise<Vocab | null> {
  const words = lookupWords(surface, basic);
  // Có câu mẫu → nghĩa phụ thuộc ngữ cảnh: bỏ qua cache module, fetch thẳng (server vẫn cache theo câu)
  if (sample) {
    for (const w of words) {
      const v = await fetchOneUncached(w, sample);
      if (v) return v;
    }
    return null;
  }
  // Từ đã cache (kể cả null) → dùng ngay, chỉ fetch từ còn thiếu, song song
  const missing = words.filter((w) => !vocabCache.has(w));
  if (missing.length > 0) {
    const results = await Promise.all(missing.map((w) => fetchOneUncached(w, sample)));
    missing.forEach((w, i) => vocabCache.set(w, results[i] ?? null));
  }
  for (const w of words) {
    const v = vocabCache.get(w);
    if (v) return v;
  }
  return null;
}

// Prefetch khi chuột vừa chạm token (trong lúc chờ debounce 150ms) —
// tooltip mount lên thường đã có sẵn nghĩa.
// Tên riêng rõ ràng → tooltip dùng nghĩa cố định, khỏi prefetch.
export function prefetchVocabToken(t: Token, sample?: string | null): void {
  try {
    if (detectProperKind(t) !== null) return;
    const { surface, basic } = normalizeToken(t);
    if (sample) {
      // Có ngữ cảnh → fetch thẳng kèm câu mẫu, không chiếm cache chung
      for (const w of lookupWords(surface, basic)) {
        fetchOneUncached(w, sample).then((v) => {
          if (v) vocabCache.set(w, v);
        });
      }
      return;
    }
    const missing = lookupWords(surface, basic).filter((w) => !vocabCache.has(w));
    for (const w of missing) {
      vocabCache.set(w, null); // đánh dấu đang bay → hover sau không fetch trùng
      fetchOneUncached(w).then((v) => vocabCache.set(w, v));
    }
  } catch {
    // ignore
  }
}

export default function VocabTooltip({
  token,
  videoId,
  onClose,
  anchorRect,
  cursorPos,
  inline,
  onMouseEnter,
  onMouseLeave,
  sample,
  isAdmin = false,
}: {
  token: Token;
  videoId?: number | null;
  onClose: () => void;
  anchorRect?: DOMRect | null;
  /** Vị trí chuột (clientX/Y) — popup hiện ngay tại đây, ưu tiên hơn anchorRect */
  cursorPos?: { x: number; y: number } | null;
  inline?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Câu phụ đề chứa từ — để AI đoán nghĩa theo ngữ cảnh khi DB chưa có */
  sample?: string | null;
  /** ADMIN thấy nút Sửa nhanh từ ngay trên tooltip */
  isAdmin?: boolean;
}) {
  const { surface, reading: tokenReading, basic } = normalizeToken(token);
  // Tên riêng rõ ràng (憂太, Pekora…) → nghĩa cố định, khỏi gọi API
  const properKind = detectProperKind(token);
  // Tên kanji gộp (乙骨) → gợi ý server tra kỹ tên riêng (đọc nanori, phiên âm chuẩn)
  const properHint = properKind !== null || isKanjiNameLike(surface) || isKanjiNameLike(basic);
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // Khởi tạo fixed + hidden để tránh nhảy layout khi chưa đo xong (bug: posStyle={} render static đẩy content)
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({
    position: "fixed",
    top: "0px",
    left: "0px",
    visibility: "hidden",
    zIndex: 60,
  });
  const [positioned, setPositioned] = useState(false);
  /** Mũi tên chỉ về chỗ chuột — null = giữa card (khi neo theo thẻ/bàn phím) */
  const [arrowLeft, setArrowLeft] = useState<number | null>(null);
  const isPopover = inline || !!anchorRect;

  useEffect(() => {
    let cancelled = false;
    // Tên riêng rõ ràng → nghĩa cố định ngay, không tốn API / không đoán mò romaji
    if (properKind) {
      setLoading(true);
      setVocab(null);
      // Tên đã biết (漏瑚→じょうご, 花御→はなみ): dùng reading chuẩn trong map.
      // Kuromoji đọc tên kanji bằng on'yomi ghép nên SAI — không được tin.
      const knownReading = getKnownProperReading(surface) ?? getKnownProperReading(basic);
      const knownMeaning = buildKnownProperMeaning(surface) ?? buildKnownProperMeaning(basic);
      const fixed = {
        id: 0,
        word: surface,
        reading: knownReading ?? formatReading(surface, tokenReading ?? surface),
        meaning: knownMeaning ?? buildProperNounMeaning(surface, properKind),
        level: "",
      } as Vocab;
      setVocab(fixed);
      setLoading(false);
      // Tên chưa có trong map: reading kuromoji (on'yomi ghép) có thể sai —
      // hỏi server (DB/Gemini nanori) để sửa reading, nghĩa cố định vẫn giữ.
      if (!knownReading) {
        lookupVocab(surface, { sample, properHint: true })
          .then((v) => {
            if (cancelled || !v) return;
            const vr = v as Vocab;
            if (vr.reading && vr.reading !== fixed.reading) {
              setVocab({ ...fixed, reading: vr.reading });
            }
          })
          .catch(() => {});
      }
      return () => {
        cancelled = true;
      };
    }
    async function fetchOne(word: string) {
      try {
        const v = await lookupVocab(word, { sample, properHint });
        if (v) return v as Vocab;
      } catch {
        // ignore → thử fetch API
      }
      try {
        const params = new URLSearchParams({ word });
        if (sample) params.set("sample", sample.slice(0, 300));
        const res = await fetch(`/api/vocab?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.vocab) return data.vocab as Vocab;
        }
      } catch {
        // ignore
      }
      return null;
    }
    async function fetchVocab() {
      setLoading(true);
      setVocab(null);
      try {
        // 1. surface (mặt chữ trong câu) — đúng với từ không chia
        // 2. basic_form (thể từ điển: 過ごし → 過ごす) — DB lưu thể này
        const words = surface === basic ? [surface] : [surface, basic];
        for (const w of words) {
          if (!w) continue;
          const v = await fetchOne(w);
          if (cancelled) return;
          if (v) {
            setVocab(v);
            return;
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchVocab();
    return () => {
      cancelled = true;
    };
  }, [surface, basic, sample, properKind, properHint, tokenReading]);

  // Position popover: ưu tiên hiện NGAY tại chỗ chuột (cursorPos),
  // fallback neo theo anchorRect khi dùng bàn phím. Clamp vào viewport.
  // Hiện tức thì, không animation bay/zoom.
  // FIX jitter: chỉ tính theo anchorRect/cursorPos, không re-run khi vocab/loading đổi
  useLayoutEffect(() => {
    if (!isPopover || !anchorRect || !cardRef.current) return;
    const card = cardRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 12;
    const padding = 8;

    const rectWidth = card.offsetWidth;
    const rectHeight = card.offsetHeight;

    let top: number;
    let left: number;
    let arrow: number | null = null;

    if (cursorPos) {
      // Hiện ngay tại chỗ chuột: lệch xuống-phải, flip khi chạm mép
      left = cursorPos.x + 14;
      top = cursorPos.y + 16;
      if (left + rectWidth > vw - padding) left = cursorPos.x - rectWidth - 14;
      if (left < padding) left = padding;
      if (top + rectHeight > vh - padding) top = cursorPos.y - rectHeight - 16;
      if (top < padding) top = padding;
      // Mũi tên chỉ đúng vào điểm chuột
      const raw = cursorPos.x - left;
      arrow = Math.max(14, Math.min(rectWidth - 14, raw));
    } else {
      left = anchorRect.left + anchorRect.width / 2 - rectWidth / 2;
      top = anchorRect.bottom + gap;
      if (left < padding) left = padding;
      if (left + rectWidth > vw - padding) left = vw - rectWidth - padding;
      if (top + rectHeight > vh - padding) {
        const flippedTop = anchorRect.top - rectHeight - gap;
        if (flippedTop >= padding) top = flippedTop;
        else top = Math.max(padding, vh - rectHeight - padding);
      }
    }

    setArrowLeft(arrow);
    setPosStyle((prev) => {
      const newTop = `${top}px`;
      const newLeft = `${left}px`;
      // Chặn vòng lặp: Chỉ cập nhật state nếu tọa độ thực sự thay đổi
      if (prev.top === newTop && prev.left === newLeft && prev.visibility === "visible") {
        return prev;
      }
      return {
        position: "fixed",
        top: newTop,
        left: newLeft,
        zIndex: 60,
        visibility: "visible",
      };
    });
    setPositioned(true);
  }, [isPopover, anchorRect, cursorPos]);

  // Lắng nghe resize (áp dụng logic chặn vòng lặp tương tự)
  useEffect(() => {
    if (!isPopover || !anchorRect) return;
    const handler = () => {
      if (!cardRef.current) return;
      const card = cardRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 12;
      const padding = 8;

      const rectWidth = card.offsetWidth;
      const rectHeight = card.offsetHeight;

      let top: number;
      let left: number;
      let arrow: number | null = null;

      if (cursorPos) {
        left = cursorPos.x + 14;
        top = cursorPos.y + 16;
        if (left + rectWidth > vw - padding) left = cursorPos.x - rectWidth - 14;
        if (left < padding) left = padding;
        if (top + rectHeight > vh - padding) top = cursorPos.y - rectHeight - 16;
        if (top < padding) top = padding;
        const raw = cursorPos.x - left;
        arrow = Math.max(14, Math.min(rectWidth - 14, raw));
      } else {
        top = anchorRect.bottom + gap;
        left = anchorRect.left + anchorRect.width / 2 - rectWidth / 2;

        if (left < padding) left = padding;
        if (left + rectWidth > vw - padding) left = vw - rectWidth - padding;

        if (top + rectHeight > vh - padding) {
          const flippedTop = anchorRect.top - rectHeight - gap;
          if (flippedTop >= padding) top = flippedTop;
          else top = Math.max(padding, vh - rectHeight - padding);
        }
      }

      setArrowLeft(arrow);
      setPosStyle((prev) => {
        const newTop = `${top}px`;
        const newLeft = `${left}px`;
        if (prev.top === newTop && prev.left === newLeft && prev.visibility === "visible") return prev;
        return {
          position: "fixed",
          top: newTop,
          left: newLeft,
          zIndex: 60,
          visibility: "visible",
        };
      });
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [isPopover, anchorRect, cursorPos]);

  const displayWord = vocab?.word ?? (basic && basic !== "*" ? basic : surface);
  // Reading nhất quán: từ katakana giữ katakana, còn lại hiragana
  // (DB cũ/Kuromoji hay lẫn lộn hai kiểu)
  const displayReading = formatReading(displayWord, vocab?.reading ?? tokenReading ?? surface);
  // Nghĩa cũ trong DB có thể còn đuôi EN "vi (en)" → chuẩn hóa Việt thuần khi hiển thị
  const displayMeaning = vocab?.meaning ? normalizeMeaningVi(vocab.meaning, displayWord) : null;
  const displayLevel = vocab?.level ?? null;
  // Tên riêng (nghĩa "Tên người/địa danh…"): badge riêng thay vì badge level
  const isProperName = !!displayMeaning && displayMeaning.startsWith("Tên ");
  // Loại từ hiện tại để dựng dropdown form sửa (chỉ phân biệt từ vựng / tên riêng)
  const initialKind = (properKind ?? parseProperKindFromMeaning(displayMeaning ?? "")) ? "proper" as const : "";

  async function handleSave() {
    if (saving || saved) return;
    setSaving(true);
    try {
      const levelRaw = typeof displayLevel === "string" && displayLevel ? displayLevel : "N5";
      const res: unknown = await createFlashcard({
        word: displayWord,
        reading: displayReading,
        meaning: displayMeaning ?? `Nghĩa của "${displayWord}" — cần bổ sung`,
        level: levelRaw,
        video_context_id: videoId ?? null,
      });
      if (res !== null && typeof res === "object" && "ok" in res) {
        const okVal: unknown = res.ok;
        if (okVal === true) {
          setSaved(true);
          let existed = false;
          if ("existed" in res) {
            const exVal: unknown = res.existed;
            existed = exVal === true;
          }
          setToast(existed ? "Đã có trong Flashcard" : "Đã lưu ✓");
          setTimeout(() => setToast(null), 2200);
        } else {
          let msg = "Lưu thất bại";
          if ("error" in res) {
            const errVal: unknown = res.error;
            if (typeof errVal === "string" && errVal) msg = errVal;
          }
          setToast(msg);
          setTimeout(() => setToast(null), 2200);
        }
      } else {
        setToast("Lưu thất bại");
        setTimeout(() => setToast(null), 2200);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Lưu thất bại";
      setToast(msg);
      setTimeout(() => setToast(null), 2200);
    } finally {
      setSaving(false);
    }
  }

  // Popover inline hover card — sakura UI, hiện NGAY tại chỗ chuột, không animation bay
  if (isPopover) {
    return (
      <div
        ref={cardRef}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={posStyle}
        className="w-[300px] max-w-[88vw]"
        data-testid="vocab-tooltip-popover"
      >
        <div className="relative rounded-xl border border-sakura-200 bg-white shadow-xl shadow-sakura-100/60 overflow-hidden">
          {/* arrow — chỉ vào đúng chỗ chuột (hoặc giữa card khi neo theo thẻ/bàn phím) */}
          {arrowLeft !== null ? (
            <div
              className="absolute -top-1.5 h-3 w-3 rotate-45 border-l border-t border-sakura-200 bg-white"
              style={{ left: `${arrowLeft - 6}px` }}
            />
          ) : (
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-l border-t border-sakura-200 bg-white" />
          )}
          {/* header: word + reading + badge + close */}
          <div className="relative p-3 pb-2">
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="absolute right-2 top-2 rounded-full p-1 text-slate-400 hover:bg-sakura-50 hover:text-sakura-600 transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="pr-6">
              <div className="text-[18px] font-bold leading-tight text-slate-900 break-words">{displayWord}</div>
              <div className="mt-0.5 text-sm font-medium text-sakura-600">{displayReading}</div>
              {isProperName ? (
                <span className="mt-1.5 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold tracking-wide text-violet-700 ring-1 ring-violet-200">
                  Tên riêng
                </span>
              ) : (
                displayLevel && (
                  <span className="mt-1.5 inline-flex items-center rounded-full bg-sakura-50 px-2 py-0.5 text-[11px] font-bold tracking-wide text-sakura-700 ring-1 ring-sakura-200">
                    {displayLevel}
                  </span>
                )
              )}
            </div>
          </div>

          {/* body: meaning — min-h ổn định để loading skeleton và nội dung cùng chiều cao, tránh nhảy khi fetch xong */}
          <div className="px-3 pb-2 min-h-[68px]">
            {editing && isAdmin ? (
              <VocabQuickEdit
                initial={{
                  word: displayWord,
                  reading: displayReading,
                  meaning: displayMeaning ?? "",
                  level: typeof displayLevel === "string" ? displayLevel : "",
                  kind: initialKind,
                }}
                vocabId={vocab && vocab.id > 0 ? vocab.id : null}
                onSaved={(saved) => {
                  setVocab({
                    id: saved.vocabId,
                    word: saved.word,
                    reading: saved.reading,
                    meaning: saved.meaning,
                    level: saved.level,
                  } as Vocab);
                  evictTooltipVocabCache(saved.word);
                  if (saved.word !== displayWord) evictTooltipVocabCache(displayWord);
                  setEditing(false);
                  setToast("Đã sửa ✓");
                  setTimeout(() => setToast(null), 2200);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : loading ? (
              <div className="animate-pulse space-y-1.5 py-1">
                <div className="h-3.5 bg-sakura-50 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            ) : vocab ? (
              <div className="rounded-lg bg-sakura-50/70 border border-sakura-100 px-2.5 py-2">
                <div className="text-[13px] leading-relaxed text-slate-700">
                  <span className="font-semibold text-sakura-700">Nghĩa: </span>
                  {displayMeaning}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-[13px] leading-relaxed text-slate-600">
                Chưa có nghĩa trong từ điển. Lưu để học sau — nghĩa sẽ được bổ sung.
                {token.pos && <div className="mt-1 text-[11px] text-slate-400">Từ loại: {token.pos}</div>}
              </div>
            )}
          </div>

          {/* inline action: + Flashcard */}
          <div className="flex items-center gap-2 px-3 pb-3">
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition shadow-sm ${
                saved
                  ? "bg-emerald-500 text-white shadow-emerald-200"
                  : "bg-sakura-500 hover:bg-sakura-600 text-white shadow-sakura-200 disabled:opacity-60"
              }`}
            >
              {saving ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Đang lưu...
                </>
              ) : saved ? (
                "Đã lưu ✓"
              ) : (
                "+ Flashcard"
              )}
            </button>
            {isAdmin && !editing && (
              <button
                onClick={() => setEditing(true)}
                disabled={loading}
                title="Sửa từ vựng trong DB (chỉ ADMIN)"
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                ✏️ Sửa
              </button>
            )}
            <span className="text-[11px] text-slate-400 hidden sm:inline">Hover 150ms • nhấn để ghim</span>
          </div>
          {!editing && (
            <div className="px-3 pb-3 -mt-1">
              <VocabReportButton
                word={displayWord}
                reading={displayReading}
                meaning={displayMeaning ?? ""}
                vocabId={vocab && vocab.id > 0 ? vocab.id : null}
              />
            </div>
          )}

          {toast && (
            <div className="absolute left-1/2 bottom-2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow-lg whitespace-nowrap">
              {toast}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback modal (click) — giữ tương thích cũ, nhưng dùng sakura palette
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" data-testid="vocab-tooltip-modal">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-sm rounded-xl border border-sakura-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-sakura-100 bg-sakura-50/50">
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold tracking-tight text-slate-900 break-words">{displayWord}</div>
            <div className="mt-1 text-sm text-sakura-600 font-medium">{displayReading}</div>
            {displayLevel && (
              <span className="mt-2 inline-flex items-center rounded-full bg-sakura-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                {displayLevel}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="shrink-0 rounded-full bg-white p-1.5 text-slate-400 hover:bg-sakura-50 hover:text-sakura-600 transition border border-sakura-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {editing && isAdmin ? (
            <VocabQuickEdit
              initial={{
                word: displayWord,
                reading: displayReading,
                meaning: displayMeaning ?? "",
                level: typeof displayLevel === "string" ? displayLevel : "",
                kind: initialKind,
              }}
              vocabId={vocab && vocab.id > 0 ? vocab.id : null}
              onSaved={(saved) => {
                setVocab({
                  id: saved.vocabId,
                  word: saved.word,
                  reading: saved.reading,
                  meaning: saved.meaning,
                  level: saved.level,
                } as Vocab);
                evictTooltipVocabCache(saved.word);
                if (saved.word !== displayWord) evictTooltipVocabCache(displayWord);
                setEditing(false);
                setToast("Đã sửa ✓");
                setTimeout(() => setToast(null), 2200);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-sakura-50 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ) : vocab ? (
            <div className="space-y-2">
              <div className="text-sm text-slate-700 leading-relaxed">
                <span className="font-semibold text-sakura-700">Nghĩa: </span>
                {displayMeaning}
              </div>
              {vocab.level && (
                <div className="inline-flex items-center rounded-full bg-sakura-50 px-2.5 py-0.5 text-xs font-semibold text-sakura-700 ring-1 ring-sakura-200">
                  {vocab.level}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
              Chưa có nghĩa trong từ điển. Bạn có thể lưu từ này để học sau — nghĩa sẽ được bổ sung.
              {token.pos && <div className="mt-1 text-xs text-slate-400">Từ loại: {token.pos}</div>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-4 pt-0">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition ${
              saved ? "bg-emerald-500 text-white" : "bg-sakura-500 hover:bg-sakura-600 text-white disabled:opacity-60"
            }`}
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Đang lưu...
              </>
            ) : saved ? (
              "Đã lưu ✓"
            ) : (
              "+ Flashcard"
            )}
          </button>
          {isAdmin && !editing && (
            <button
              onClick={() => setEditing(true)}
              disabled={loading}
              title="Sửa từ vựng trong DB (chỉ ADMIN)"
              className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition"
            >
              ✏️ Sửa
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Đóng
          </button>
        </div>
        {!editing && (
          <div className="px-4 pb-4 -mt-1">
            <VocabReportButton
              word={displayWord}
              reading={displayReading}
              meaning={displayMeaning ?? ""}
              vocabId={vocab && vocab.id > 0 ? vocab.id : null}
            />
          </div>
        )}

        {toast && (
          <div className="absolute left-1/2 bottom-3 -translate-x-1/2 rounded-full bg-slate-900 border border-slate-700 px-4 py-1.5 text-sm text-white shadow-lg whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
