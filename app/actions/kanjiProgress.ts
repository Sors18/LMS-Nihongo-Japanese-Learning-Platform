"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { Role, Level, KanjiProgress } from "@prisma/client";
import { updateDailyActivity } from "@/lib/streak";

async function ensureUser() {
  const cu = await getCurrentUser();
  if (!cu) return null;
  let user = await prisma.user.findUnique({ where: { id: cu.id } });
  if (user) return user;
  user = await prisma.user.findUnique({ where: { email: cu.email } });
  if (user) return user;
  // Validate role/level to prisma enums
  const role: Role = cu.role === "ADMIN" ? "ADMIN" : "USER";
  const allowedLevel = ["N5", "N4", "N3", "N2", "N1"] as const;
  const lvl: Level = (allowedLevel as readonly string[]).includes(cu.target_level)
    ? (cu.target_level as Level)
    : "N4";
  try {
    user = await prisma.user.create({
      data: {
        id: cu.id,
        email: cu.email,
        name: cu.name,
        role,
        target_level: lvl,
        password_hash: "oauth-no-password",
      },
    });
  } catch {
    user = await prisma.user.findUnique({ where: { email: cu.email } });
  }
  return user;
}

export async function saveKanjiAttempt(
  kanji: string,
  mastered: boolean
): Promise<{ ok: boolean; error?: string; progress?: KanjiProgress }> {
  const k = kanji?.trim();
  if (!k) return { ok: false, error: "Thiếu ký tự Kanji" };
  // validate single kanji-ish but allow up to 5 chars
  if (k.length > 10) return { ok: false, error: "Kanji quá dài" };
  // check contains at least one Han character
  const hasKanji = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(k);
  if (!hasKanji) return { ok: false, error: "Ký tự không phải Kanji" };

  const user = await ensureUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };

  // Upsert: increment attempts, update mastered if true
  const existing = await prisma.kanjiProgress.findUnique({
    where: { user_id_kanji: { user_id: user.id, kanji: k } },
  });

  let progress;
  if (existing) {
    progress = await prisma.kanjiProgress.update({
      where: { user_id_kanji: { user_id: user.id, kanji: k } },
      data: {
        attempts: { increment: 1 },
        mastered: mastered ? true : existing.mastered,
      },
    });
  } else {
    progress = await prisma.kanjiProgress.create({
      data: {
        user_id: user.id,
        kanji: k,
        attempts: 1,
        mastered: !!mastered,
      },
    });
  }

  revalidatePath("/kanji");
  // Ghi streak — best effort
  try {
    await updateDailyActivity(user.id);
  } catch {}
  return { ok: true, progress };
}

// Alias for compatibility if needed
export const saveAttempt = saveKanjiAttempt;
