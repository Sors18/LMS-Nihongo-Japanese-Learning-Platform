"use client";

import TokenizedSubtitle from "./TokenizedSubtitle";
import { splitSpeakerSegments } from "@/lib/dialogue";
import { isVietnameseOnly, splitTrailingVietnamese } from "@/lib/bilingual";
import type { ReactNode } from "react";
export type SubtitleLineProps = {
  /** Raw Japanese text — primary prop per Slice B spec */
  raw_text?: string;
  /** camelCase alias for compatibility */
  rawText?: string;
  /** fallback plain text */
  text?: string;
  /** active flag per Slice B spec */
  active?: boolean;
  /** alias for active — used by Slice D's TokenizedSubtitle wrapper */
  isActive?: boolean;
  /** full subtitle object — optional, for Slice D compatibility (isActive + subtitle) */
  subtitle?: {
    id: number | string;
    raw_text: string;
    start_time_ms?: number;
    end_time_ms?: number;
  };
  /** optional children for Slice D tokenization layer — if provided, renders children instead of <p> */
  children?: ReactNode;
  className?: string;
  id?: string | number;
  /** Bản dịch Việt song ngữ — hiện dưới câu Nhật + làm ngữ cảnh tra nghĩa */
  translation?: string | null;
  /** Slice D: video context for flashcard saving */
  videoId?: number | null;
  /** Slice D: pause video when token clicked */
  onPause?: () => void;
  /** Tokens prefetch sẵn — khi có thì TokenizedSubtitle khỏi fetch riêng */
  tokens?: unknown[] | null;
  /** ADMIN thấy nút Sửa nhanh trong tooltip */
  isAdmin?: boolean;
  /** Slice D: when true and active, auto-render TokenizedSubtitle instead of plain <p> */
  enableTokenization?: boolean;
};
/**
 * SubtitleLine — presentational line for a single subtitle entry.
 * Slice B: renders plain <p> for raw_text; Slice D wraps with tokenization
 * when `children` is supplied or when imported by TokenizedSubtitle.
 * Must stay lightweight and client-safe (no prisma/kuromoji).
 */
export default function SubtitleLine({
  raw_text,
  rawText,
  text,
  active,
  isActive,
  subtitle,
  children,
  className,
  id,
  videoId,
  onPause,
  tokens,
  translation,
  isAdmin = false,
  enableTokenization = true,
}: SubtitleLineProps) {
  const resolvedText = raw_text ?? rawText ?? text ?? subtitle?.raw_text ?? "";
  const resolvedActive = active ?? isActive ?? false;
  const subtitleId = id ?? subtitle?.id;
  // Lưới an toàn: sub cũ dính đuôi Việt chung dòng → tách ra, Nhật 1 dòng / Việt 1 dòng
  const stuck = splitTrailingVietnamese(resolvedText);
  const displayJp = stuck.jp;
  const resolvedVi = (translation ?? "").trim() || stuck.vi;
  // Dòng thuần Việt (VD "CHỦ THUẬT HỒI CHIẾN") → hiện nhỏ như bản dịch, không tokenize
  const vietnameseOnly = isVietnameseOnly(displayJp);
  // Dòng đã tách: token prefetch của cả dòng dính (kèm từ Việt) không còn khớp →
  // bỏ, để TokenizedSubtitle tokenize lại câu Nhật sạch (tránh Việt mất dấu cách, dính liền)
  const wasSplit = displayJp !== resolvedText;

  // Slice D enhancement: when active and tokenization enabled, render TokenizedSubtitle
  // Tokenize mọi dòng (không chỉ dòng active) để hover dòng nào cũng tra được từ vựng
  // Ngoại lệ: dòng thuần Việt → text nhỏ, khỏi chạy kuromoji
  const shouldTokenize = enableTokenization && !children && !vietnameseOnly && displayJp.trim() !== "";

  // 1 khung giờ có 2 nhân vật thoại (marker (Tên)) → xuống dòng mỗi người, tránh loạn
  const segments = shouldTokenize ? splitSpeakerSegments(displayJp) : [displayJp];

  return (
    <div
      data-testid="subtitle-line"
      data-active={resolvedActive ? "true" : "false"}
      data-subtitle-id={subtitleId !== undefined ? String(subtitleId) : undefined}
      data-raw={resolvedText}
      className={className}
    >
      {children ??
        (shouldTokenize ? (
          <>
            {segments.length > 1 ? (
              <div className="space-y-1">
                {segments.map((seg, i) => (
                  <TokenizedSubtitle key={i} rawText={seg} translation={resolvedVi} videoId={videoId ?? null} onPause={onPause} isAdmin={isAdmin} />
                ))}
              </div>
            ) : (
              <TokenizedSubtitle rawText={displayJp} translation={resolvedVi} videoId={videoId ?? null} onPause={onPause} isAdmin={isAdmin} initialTokens={wasSplit ? undefined : (tokens ?? undefined)} />
            )}
            {resolvedVi && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{resolvedVi}</p>
            )}
          </>
        ) : (
          <>
            <p
              className={
                vietnameseOnly
                  ? "text-xs leading-relaxed text-slate-500"
                  : resolvedActive
                    ? "text-sakura-900 font-medium leading-relaxed"
                    : "text-slate-700 leading-relaxed"
              }
            >
              {displayJp}
            </p>
            {resolvedVi && (
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{resolvedVi}</p>
            )}
          </>
        ))}
    </div>
  );
}
