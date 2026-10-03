"use server";

import { prisma, isMissingColumnError } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { Level, FlashcardStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { updateDailyActivity } from "@/lib/streak";
import { scheduleReview, clampQuality } from "@/lib/srs";

/** Chỉ cột cũ — dùng khi DB chưa migrate SRS (tránh P2022 do SELECT * cột due_at). */
const LEGACY_SELECT = {
  id: true,
  user_id: true,
  vocab_id: true,
  video_context_id: true,
  status: true,
  created_at: true,
  updated_at: true,
} as const;
async function ensureUser() {
  const cu = await getCurrentUser();
  if (!cu) throw new Error("Unauthorized");
  let user = await prisma.user.findUnique({ where: { id: cu.id } });
  if (user) return user;
  user = await prisma.user.findUnique({ where: { email: cu.email } });
  if (user) return user;
  user = await prisma.user.create({
    data: {
      id: cu.id,
      email: cu.email,
      name: cu.name,
      password_hash: "demo",
      target_level: (cu.target_level as Level) ?? "N4",
    },
  });
  return user;
}

export async function createFlashcard(input: {
  word: string;
  reading?: string;
  meaning?: string;
  level?: Level | string;
  video_context_id?: number | null;
}) {
  const word = input.word?.trim();
  if (!word) return { ok: false as const, error: "Thiếu từ vựng" };

  const reading = (input.reading?.trim() || word).slice(0, 255);
  const meaning = (input.meaning?.trim() || "Chưa có nghĩa — cần bổ sung").slice(0, 500);
  const levelRaw = (input.level as string) || "N5";
  const level: Level = (["N5", "N4", "N3", "N2", "N1"].includes(levelRaw) ? levelRaw : "N5") as Level;

  let vocab = await prisma.vocabulary.findFirst({ where: { word, reading } });
  if (!vocab) {
    vocab = await prisma.vocabulary.findFirst({ where: { word } });
  }
  if (!vocab) {
    vocab = await prisma.vocabulary.create({
      data: { word, reading, meaning, level },
    });
  }

  const user = await ensureUser();

  const existing = await prisma.flashcard.findFirst({
    where: { user_id: user.id, vocab_id: vocab.id },
    select: { id: true },
  });
  if (existing) {
    return { ok: true as const, flashcardId: existing.id, vocabId: vocab.id, existed: true as const };
  }

  const flashcard = await prisma.flashcard.create({
    data: {
      user_id: user.id,
      vocab_id: vocab.id,
      video_context_id: input.video_context_id ?? null,
      status: "NEW",
    },
    select: { id: true },
  });

  // Ghi nhận streak — best effort, không làm fail flow chính
  try {
    await updateDailyActivity(user.id);
  } catch {}

  return { ok: true as const, flashcardId: flashcard.id, vocabId: vocab.id };
}

// Slice D signature: updateFlashcardStatus({flashcardId, status})
// Slice E signature: updateFlashcardStatus(id, status) — support both via overload
export async function updateFlashcardStatus(
  arg1: number | { flashcardId: number; status: FlashcardStatus | string },
  arg2?: FlashcardStatus | string
): Promise<{ ok: boolean; error?: string; flashcard?: any }> {
  let id: number;
  let status: string;
  if (typeof arg1 === "object" && arg1 !== null) {
    id = (arg1 as any).flashcardId;
    status = (arg1 as any).status;
  } else {
    id = arg1 as number;
    status = arg2 as string;
  }

  const allowed: string[] = ["NEW", "LEARNING", "MASTERED"];
  if (!allowed.includes(status)) return { ok: false as const, error: "Trạng thái không hợp lệ" };

  const user = await ensureUser();
  const card = await prisma.flashcard.findUnique({ where: { id }, select: LEGACY_SELECT });
  if (!card) return { ok: false as const, error: "Flashcard không tồn tại" };
  if (card.user_id !== user.id) return { ok: false as const, error: "Không có quyền" };

  let updated;
  try {
    updated = await prisma.flashcard.update({
      where: { id },
      data: { status: status as FlashcardStatus },
    });
  } catch (e) {
    // DB chưa migrate SRS → update full nổ P2022, thử lại chỉ cột cũ
    if (!isMissingColumnError(e)) throw e;
    updated = await prisma.flashcard.update({
      where: { id },
      data: { status: status as FlashcardStatus },
      select: LEGACY_SELECT,
    });
  }
  revalidatePath("/flashcards");
  try {
    await updateDailyActivity(user.id);
  } catch {}
  return { ok: true as const, flashcard: updated };
}

// Alias required by Slice E spec: updateStatus
export const updateStatus = updateFlashcardStatus;

/**
 * SRS review — quality 0..5 (Again=0-2, Hard=3, Good=4, Easy=5).
 * Cập nhật interval/ease/repetitions/due_at/status theo SM-2.
 * Tương thích DB chưa migrate: nếu cột SRS chưa có (P2011/P2022), fallback cập nhật status.
 */
export async function reviewFlashcard(
  flashcardId: number,
  qualityRaw: number | string
): Promise<{ ok: boolean; error?: string; flashcard?: unknown; due_at?: Date }> {
  const quality = clampQuality(qualityRaw);
  const user = await ensureUser();
  // DB chưa migrate SRS → findUnique full nổ P2022: thử full trước, rớt về cột cũ
  let card: Record<string, unknown> | null;
  try {
    card = (await prisma.flashcard.findUnique({ where: { id: flashcardId } })) as unknown as Record<
      string,
      unknown
    > | null;
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    card = (await prisma.flashcard.findUnique({
      where: { id: flashcardId },
      select: LEGACY_SELECT,
    })) as unknown as Record<string, unknown> | null;
  }
  if (!card) return { ok: false as const, error: "Flashcard không tồn tại" };
  if (card["user_id"] !== user.id) return { ok: false as const, error: "Không có quyền" };

  const prev = {
    interval: Number(card["interval"] ?? 0) || 0,
    ease: Number(card["ease"] ?? 2.5) || 2.5,
    repetitions: Number(card["repetitions"] ?? 0) || 0,
  };
  const next = scheduleReview(prev, quality);

  try {
    const updated = await prisma.flashcard.update({
      where: { id: flashcardId },
      data: {
        status: next.status as FlashcardStatus,
        due_at: next.due_at,
        interval: next.interval,
        ease: next.ease,
        repetitions: next.repetitions,
        last_reviewed_at: new Date(),
      } as never,
    });
    revalidatePath("/flashcards");
    try {
      await updateDailyActivity(user.id);
    } catch {}
    return { ok: true as const, flashcard: updated, due_at: next.due_at };
  } catch (e) {
    // DB chưa `db push` cột SRS → fallback chỉ đổi status để UI không gãy
    if (isMissingColumnError(e)) {
      const fallbackStatus = quality < 3 ? "LEARNING" : next.status;
      const updated = await prisma.flashcard.update({
        where: { id: flashcardId },
        data: { status: fallbackStatus as FlashcardStatus },
        select: LEGACY_SELECT,
      });
      revalidatePath("/flashcards");
      return { ok: true as const, flashcard: updated };
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown argument") || msg.includes("P2011") || msg.includes("P2022")) {
      const fallbackStatus = quality < 3 ? "LEARNING" : next.status;
      const updated = await prisma.flashcard.update({
        where: { id: flashcardId },
        data: { status: fallbackStatus as FlashcardStatus },
        select: LEGACY_SELECT,
      });
      revalidatePath("/flashcards");
      return { ok: true as const, flashcard: updated };
    }
    return { ok: false as const, error: msg };
  }
}

export async function deleteFlashcard(flashcardId: number) {
  const user = await ensureUser();
  const fc = await prisma.flashcard.findUnique({ where: { id: flashcardId }, select: LEGACY_SELECT });
  if (!fc) return { ok: false as const, error: "Flashcard không tồn tại" };
  if (fc.user_id !== user.id) return { ok: false as const, error: "Không có quyền" };
  await prisma.flashcard.delete({ where: { id: flashcardId } });
  revalidatePath("/flashcards");
  return { ok: true as const };
}
