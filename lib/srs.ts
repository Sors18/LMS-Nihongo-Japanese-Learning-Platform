/**
 * SRS SM-2 (Anki-style) — pure, testable, không phụ thuộc DB.
 * quality: 0..5 (Again=0..2, Hard=3, Good=4, Easy=5)
 * Trả về { interval (ngày), ease, repetitions, due_at, status }.
 */

export type SrsQuality = 0 | 1 | 2 | 3 | 4 | 5;

export type SrsState = {
  interval: number;
  ease: number;
  repetitions: number;
};

export type SrsResult = SrsState & {
  due_at: Date;
  status: "NEW" | "LEARNING" | "MASTERED";
};

const DAY_MS = 86_400_000;

export function clampQuality(q: unknown): SrsQuality {
  const n = typeof q === "number" ? q : Number(q);
  if (!Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  if (i < 0) return 0;
  if (i > 5) return 5;
  return i as SrsQuality;
}

export function scheduleReview(
  prev: SrsState,
  qualityRaw: unknown,
  now: Date = new Date()
): SrsResult {
  const quality = clampQuality(qualityRaw);
  let { interval, ease, repetitions } = prev;

  if (!Number.isFinite(interval) || interval < 0) interval = 0;
  if (!Number.isFinite(ease) || ease < 1.3) ease = 2.5;
  if (!Number.isFinite(repetitions) || repetitions < 0) repetitions = 0;

  if (quality < 3) {
    // Again — quên: reset chuỗi, học lại sau 10 phút (~0.007 ngày → làm tròn due +10p)
    repetitions = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    return {
      interval,
      ease: round2(ease),
      repetitions,
      due_at: new Date(now.getTime() + 10 * 60_000),
      status: "LEARNING",
    };
  }

  repetitions += 1;
  // Cập nhật ease theo SM-2
  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease < 1.3) ease = 1.3;

  if (repetitions === 1) interval = 1;
  else if (repetitions === 2) interval = 6;
  else interval = Math.max(1, Math.round(interval * ease));

  const status = interval >= 21 || repetitions >= 5 ? "MASTERED" : "LEARNING";

  return {
    interval,
    ease: round2(ease),
    repetitions,
    due_at: new Date(now.getTime() + interval * DAY_MS),
    status,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map nút UI → quality */
export const QUALITY_BY_BUTTON = {
  again: 2,
  hard: 3,
  good: 4,
  easy: 5,
} as const;

export type ReviewButton = keyof typeof QUALITY_BY_BUTTON;
