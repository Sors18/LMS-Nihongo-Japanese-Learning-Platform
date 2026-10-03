import { prisma } from "./prisma";
import type { Level } from "@prisma/client";

export const ROADMAP_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type RoadmapLevel = (typeof ROADMAP_LEVELS)[number];

export type RoadmapLevelProgress = {
  level: RoadmapLevel;
  total: number;
  mastered: number;
  percent: number;
  avgScore: number | null;
  testCount: number;
};

/**
 * Tính progress per level N5-N1:
 * - total: tổng số từ vựng theo level (prisma.vocabulary)
 * - mastered: số flashcard đã MASTERED của user theo level
 * - percent: mastered / total * 100 (rounded)
 * - avgScore: điểm trung bình TestResult theo level (score/total_questions*100), null nếu chưa có bài test
 * - testCount: số bài test đã làm per level
 *
 * Thực hiện 1 nhóm query per level (parallel). Tổng 5 levels.
 */
export async function getRoadmapProgress(userId: string): Promise<RoadmapLevelProgress[]> {
  const levels = ROADMAP_LEVELS as readonly Level[];

  const results: RoadmapLevelProgress[] = [];

  for (const level of levels) {
    // 1 query group per level: vocabulary count + mastered count + test results
    // Dùng Promise.all để chạy song song nhưng vẫn tính là 1 logical batch per level
    const [total, mastered, testResults] = await Promise.all([
      prisma.vocabulary.count({ where: { level } }),
      prisma.flashcard.count({
        where: {
          user_id: userId,
          status: "MASTERED",
          vocabulary: { level },
        },
      }),
      prisma.testResult.findMany({
        where: {
          user_id: userId,
          video: { level },
        },
        select: { score: true, total_questions: true },
      }),
    ]);

    const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;

    let avgScore: number | null = null;
    let testCount = testResults.length;
    if (testCount > 0) {
      const sumPct = testResults.reduce((sum, r) => {
        if (!r.total_questions || r.total_questions === 0) return sum;
        return sum + (r.score / r.total_questions) * 100;
      }, 0);
      avgScore = Math.round(sumPct / testCount);
    }

    results.push({
      level: level as RoadmapLevel,
      total,
      mastered,
      percent,
      avgScore,
      testCount,
    });
  }

  return results;
}
