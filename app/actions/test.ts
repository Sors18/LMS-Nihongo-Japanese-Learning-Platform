"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { updateDailyActivity } from "@/lib/streak";
type SubmitTestInput = {
  videoId: number;
  answers: Record<string, string>;
};

export async function submitTest({ videoId, answers }: SubmitTestInput): Promise<{
  score: number;
  total: number;
}> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Vui lòng đăng nhập để làm test");
  }
  const userId = user.id;

  // Ensure user exists
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: user.email ?? "user@lms.local",
      password_hash: "demo",
      name: user.name ?? "User",
      target_level: (user as unknown as { target_level?: "N5" | "N4" | "N3" | "N2" | "N1" }).target_level ?? "N4",
    },
  });
  const questions = await prisma.question.findMany({
    where: { video_id: videoId },
    orderBy: { id: "asc" },
  });

  const total = questions.length;
  let score = 0;

  for (const q of questions) {
    const given = (answers[String(q.id)] ?? "").trim();
    const correct = (q.correct_answer ?? "").trim();
    // strict compare after trim; case-sensitive for Vietnamese/Japanese
    // For choice questions we compare normalized trimmed values
    if (given !== "" && given === correct) {
      score += 1;
    }
  }

  await prisma.testResult.create({
    data: {
      user_id: userId,
      video_id: videoId,
      score,
      total_questions: total,
    },
  });

  // Ghi nhận streak sau khi nộp bài — best effort
  try {
    await updateDailyActivity(userId);
  } catch {}

  revalidatePath("/history");
  revalidatePath(`/video/${videoId}`);

  return { score, total };
}
