"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { tokenizeAction } from "@/app/actions/tokenize";
import VocabTooltip from "@/components/VocabTooltip";
import { isSkippableToken, mergeMixedScriptTokens } from "@/lib/vocabFilter";
import { mergeCollocations } from "@/lib/collocations";
import { sampleWithTranslation } from "@/lib/bilingual";
import { formatReading } from "@/lib/meaningVi";

type Token = {
  surface_form: string;
  reading?: string;
  pos: string;
  basic_form: string;
  word?: string;
  basic?: string;
  pos_detail?: string;
  pos_sub?: string;
};

function normalizeToken(t: unknown): Token {
  if (t !== null && typeof t === "object") {
    const obj = t as Record<string, unknown>;
    const sf = typeof obj.surface_form === "string" ? obj.surface_form : typeof obj.word === "string" ? obj.word : String(t);
    const rd =
      typeof obj.reading === "string"
        ? obj.reading
        : typeof obj.surface_form === "string"
          ? obj.surface_form
          : typeof obj.word === "string"
            ? obj.word
            : String(t);
    const ps = typeof obj.pos === "string" ? obj.pos : "unknown";
    const bf =
      typeof obj.basic_form === "string"
        ? obj.basic_form
        : typeof obj.basic === "string"
          ? obj.basic
          : typeof obj.surface_form === "string"
            ? obj.surface_form
            : typeof obj.word === "string"
              ? obj.word
              : String(t);
    const w = typeof obj.word === "string" ? obj.word : undefined;
    const b = typeof obj.basic === "string" ? obj.basic : undefined;
    const pd = typeof obj.pos_detail === "string" ? obj.pos_detail : undefined;
    const ps2 = typeof obj.pos_sub === "string" ? obj.pos_sub : undefined;
    return { surface_form: sf, reading: rd, pos: ps, basic_form: bf, word: w, basic: b, pos_detail: pd, pos_sub: ps2 };
  }
  const s = String(t);
  return { surface_form: s, reading: s, pos: "unknown", basic_form: s };
}

function isSpaceToken(tok: Token): boolean {
  return tok.pos === "space" || tok.surface_form.trim() === "";
}

/** Gộp cụm katakana+hiragana (ジェラってる…) + cụm cố định (気になる…) rồi refresh alias word/basic để lookup cả cụm */
function applyMerge(list: Token[]): Token[] {
  return mergeCollocations(mergeMixedScriptTokens(list)).map((t) => ({ ...t, word: t.surface_form, basic: t.basic_form }));
}

function isVocabCandidate(tok: Token): boolean {  if (isSpaceToken(tok)) return false;
  // single punct
  if (tok.surface_form.length === 1 && /^[\p{P}\p{S}\s]$/u.test(tok.surface_form)) return false;
  // use shared filter to avoid underlining noise/particles
  try {
    const skippable = isSkippableToken({
      surface_form: tok.surface_form,
      reading: tok.reading ?? tok.surface_form,
      pos: tok.pos,
      basic_form: tok.basic_form,
    });
    return !skippable;
  } catch {
    // fallback: underline tokens with kanji/kana length>1
    return tok.surface_form.trim().length > 1;
  }
}

export default function TokenizedSubtitle({
  rawText,
  translation,
  videoId,
  onPause,
  onTokenClick,
  className,
  initialTokens,
  isAdmin = false,
}: {
  rawText: string;
  /** Bản dịch Việt — ghép vào sample để AI chốt nghĩa đúng ngữ cảnh */
  translation?: string | null;
  videoId?: number | null;
  onPause?: () => void;
  onTokenClick?: (token: Token) => void;
  className?: string;
  /** Tokens prefetch sẵn (SubtitlePanel batch) — có thì khỏi fetch riêng */
  initialTokens?: unknown[] | null;
  /** ADMIN thấy nút Sửa nhanh trong tooltip */
  isAdmin?: boolean;
}) {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Token | null>(null);

  // Hover tooltip state — debounce 150ms, hiện tooltip ngay khi hover
  const [hovered, setHovered] = useState<Token | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  // Vị trí chuột lúc hover/click — popup hiện ngay tại đây, không neo xa
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipHoveredRef = useRef(false);

  useEffect(() => {
    if (initialTokens !== undefined && initialTokens !== null) {
      const normalized = Array.isArray(initialTokens) ? initialTokens.map(normalizeToken) : [];
      const filtered = normalized.filter((t) => t.surface_form && t.surface_form.trim() !== "");
      setTokens(
        filtered.length > 0
          ? applyMerge(filtered)
          : [{ surface_form: rawText, reading: rawText, pos: "unknown", basic_form: rawText }]
      );
      setLoading(false);
      return;
    }
    if (!rawText?.trim()) {
      setTokens([]);
      return;
    }
    let cancelled = false;
    // Nhường batch ở SubtitlePanel (ưu tiên điểm tua) chạy trước:
    // delay fetch lẻ 500ms — nếu batch cấp tokens trong lúc chờ thì khỏi bắn
    // N request từng cái 1 khi vừa tua, tránh đè server kuromoji.
    const GRACE_MS = 500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const result: unknown = await tokenizeAction(rawText);
        if (cancelled) return;
        const normalized = Array.isArray(result) ? result.map(normalizeToken) : [];
        const filtered = normalized.filter((t) => t.surface_form && t.surface_form.trim() !== "");
        if (filtered.length === 0) {
          setTokens([{ surface_form: rawText, reading: rawText, pos: "unknown", basic_form: rawText }]);
        } else {
          setTokens(applyMerge(filtered));
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Tokenize failed";
        setError(msg);
        const fallback: Token[] = rawText
          .split(/(\s+)/)
          .filter(Boolean)
          .map((chunk) => ({
            surface_form: chunk,
            reading: chunk,
            pos: chunk.trim() === "" ? "space" : "unknown",
            basic_form: chunk,
          }));
        setTokens(fallback.length ? fallback : [{ surface_form: rawText, reading: rawText, pos: "unknown", basic_form: rawText }]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    timer = setTimeout(() => {
      if (!cancelled) run();
    }, GRACE_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [rawText, initialTokens]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const clearHoverTimers = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleTokenEnter = useCallback(
    (token: Token, el: HTMLElement, clientX?: number, clientY?: number) => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      // Debounce 150ms — yêu cầu spec
      hoverTimerRef.current = setTimeout(() => {
        setHovered(token);
        setAnchorRect(el.getBoundingClientRect());
        // Ghi vị trí chuột để popup hiện ngay tại đó
        if (typeof clientX === "number" && typeof clientY === "number") {
          setCursorPos({ x: clientX, y: clientY });
        } else {
          setCursorPos(null);
        }
      }, 150);
    },
    []
  );

  const handleTokenLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // Delay hide để cho phép di chuyển chuột sang tooltip (mượt)
    leaveTimerRef.current = setTimeout(() => {
      if (!tooltipHoveredRef.current) {
        setHovered(null);
        setAnchorRect(null);
        setCursorPos(null);
      }
    }, 80);
  }, []);

  const handleTooltipEnter = useCallback(() => {
    tooltipHoveredRef.current = true;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleTooltipLeave = useCallback(() => {
    tooltipHoveredRef.current = false;
    setHovered(null);
    setAnchorRect(null);
    setCursorPos(null);
  }, []);

  const handleClick = useCallback(
    (token: Token, e: React.MouseEvent<HTMLElement>) => {
      clearHoverTimers();
      // Click → hiện ngay tại chỗ chuột, không debounce, pin tooltip
      setHovered(token);
      setAnchorRect(e.currentTarget.getBoundingClientRect());
      setCursorPos({ x: e.clientX, y: e.clientY });
      // vẫn hỗ trợ modal cũ trên mobile nếu cần pin
      setSelected(token);
      onPause?.();
      onTokenClick?.(token);
    },
    [clearHoverTimers, onPause, onTokenClick]
  );

  const handleFocus = useCallback(
    (token: Token, el: HTMLElement) => {
      // keyboard focus cũng debounce 150ms — không có chuột nên neo theo thẻ
      handleTokenEnter(token, el);
    },
    [handleTokenEnter]
  );

  if (loading && !tokens) {
    return (
      <div className={className ?? "text-base leading-relaxed text-slate-800"}>
        <span className="inline-flex items-center gap-2 text-slate-400 text-sm">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-sakura-200 border-t-sakura-500" />
          Đang phân tách...
        </span>
      </div>
    );
  }

  if (!tokens || tokens.length === 0) {
    return <div className={className ?? "text-base leading-relaxed text-slate-800"}>{rawText}</div>;
  }

  // Sample tra nghĩa: câu JP kèm bản dịch Việt (nếu có) để AI chốt nghĩa đúng
  const lookupSample = sampleWithTranslation(rawText, translation);

  return (
    <>
      <div className={className ?? "text-base leading-[2.1]"}>
        {tokens.map((tok, idx) => {
          const isSpace = isSpaceToken(tok);
          if (isSpace) {
            return <span key={idx}>{tok.surface_form}</span>;
          }
          const vocabCandidate = isVocabCandidate(tok);
          // Chỉ quét từ vựng mới: token loại (trợ từ, ký hiệu, cảm thán...)
          // render text thường, không hover/click/tooltip.
          if (!vocabCandidate) {
            return <span key={idx}>{tok.surface_form}</span>;
          }
          return (
            <span
              key={idx}
              onClick={(e) => handleClick(tok, e)}
              onMouseEnter={(e) => handleTokenEnter(tok, e.currentTarget, e.clientX, e.clientY)}
              onMouseLeave={handleTokenLeave}
              onFocus={(e) => handleFocus(tok, e.currentTarget)}
              onBlur={handleTokenLeave}
              className={[
                "cursor-pointer rounded px-0.5 align-baseline transition-colors",
                "hover:bg-sakura-50",
                "underline decoration-sakura-300 decoration-dotted underline-offset-4",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-sakura-300 focus-visible:bg-sakura-50",
              ].join(" ")}
              title={`${formatReading(tok.surface_form, tok.reading ?? "")} (${tok.pos}) — hover để tra nghĩa`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  // keyboard activation → immediate tooltip
                  setHovered(tok);
                  setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
                  handleClick(tok, e as unknown as React.MouseEvent<HTMLElement>);
                }
              }}
              data-testid="token"
              data-surface={tok.surface_form}
            >
              {tok.surface_form}
            </span>
          );
        })}
      </div>

      {error && <div className="mt-1 text-xs text-amber-600/80">{error} — hiển thị fallback</div>}

      {/* Hover tooltip — inline popover tại chỗ chuột, debounce 150ms, sakura UI */}
      {hovered && anchorRect && !selected && (
        <VocabTooltip
          token={hovered}
          videoId={videoId ?? null}
          anchorRect={anchorRect}
          cursorPos={cursorPos}
          sample={lookupSample}
          inline
          isAdmin={isAdmin}
          onClose={() => {
            setHovered(null);
            setAnchorRect(null);
            setCursorPos(null);
          }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        />
      )}

      {/* Click pinned modal — fallback cho mobile / click giữ */}
      {selected && (
        <VocabTooltip
          token={selected}
          videoId={videoId ?? null}
          sample={lookupSample}
          isAdmin={isAdmin}
          onClose={() => {
            setSelected(null);
            // also clear hover if same token
            setHovered(null);
            setAnchorRect(null);
            setCursorPos(null);
          }}
        />
      )}
    </>
  );
}
