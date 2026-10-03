import { prisma } from "./prisma";

// Helpers xử lý streak lửa + heatmap GitHub style
// Mỗi ngày có 1 DailyActivity row với xp + count

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDateKey(d: Date): string {
  // local date YYYY-MM-DD
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function getTodayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getMidnight(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Mỗi hoạt động cộng 10 XP và 1 count
const XP_PER_ACTIVITY = 10;

/**
 * Upsert hoạt động hôm nay: tăng xp và count
 * Không ném lỗi nếu userId rỗng — trả null để caller tiếp tục flow chính
 */
export async function updateDailyActivity(userId: string) {
  if (!userId) return null;
  const today = getTodayMidnight();
  try {
    // Tránh phụ thuộc vào tên compound unique (user_id_date),
    // dùng findFirst + update/create để tương thích mọi version prisma
    const existing = await prisma.dailyActivity.findFirst({
      where: { user_id: userId, date: today },
    });
    if (existing) {
      return await prisma.dailyActivity.update({
        where: { id: existing.id },
        data: {
          xp: { increment: XP_PER_ACTIVITY },
          count: { increment: 1 },
        },
      });
    }
    return await prisma.dailyActivity.create({
      data: {
        user_id: userId,
        date: today,
        xp: XP_PER_ACTIVITY,
        count: 1,
      },
    });
  } catch (e) {
    // Nếu race condition tạo duplicate, thử update lại
    try {
      const again = await prisma.dailyActivity.findFirst({
        where: { user_id: userId, date: today },
      });
      if (again) {
        return await prisma.dailyActivity.update({
          where: { id: again.id },
          data: { xp: { increment: XP_PER_ACTIVITY }, count: { increment: 1 } },
        });
      }
    } catch {}
    throw e;
  }
}

/**
 * Tính streak liên tiếp: số ngày liên tục có activity tính tới hôm nay
 * Nếu hôm nay chưa có activity nhưng hôm qua có thì streak vẫn tính từ hôm qua
 * Ví dụ: hôm nay chưa làm nhưng hôm qua + hôm kia có => streak=2
 */
export async function getStreak(userId: string): Promise<number> {
  if (!userId) return 0;
  const rows = await prisma.dailyActivity.findMany({
    where: { user_id: userId, count: { gt: 0 } },
    orderBy: { date: "desc" },
    take: 365,
    select: { date: true, count: true },
  });
  if (rows.length === 0) return 0;

  const set = new Set<string>();
  for (const r of rows) {
    set.add(formatDateKey(new Date(r.date)));
  }

  const today = getTodayMidnight();
  const todayKey = formatDateKey(today);
  const hasToday = set.has(todayKey);

  let cursor = new Date(today);
  // Nếu hôm nay chưa có, bắt đầu từ hôm qua; nếu hôm qua cũng không có => streak 0
  if (!hasToday) {
    cursor.setDate(cursor.getDate() - 1);
    const yKey = formatDateKey(cursor);
    if (!set.has(yKey)) return 0;
  }

  let streak = 0;
  while (set.has(formatDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
    // guard 400 ngày
    if (streak > 365) break;
  }
  return streak;
}

/**
 * Trả về heatmap cho `days` ngày gần nhất (mặc định 90)
 * Dạng mảng sort tăng dần theo date, mỗi phần tử { date: 'YYYY-MM-DD', count, xp }
 * Kèm map Record<string, number> để tra nhanh
 */
export async function getHeatmap(
  userId: string,
  days = 90
): Promise<Array<{ date: string; count: number; xp: number }>> {
  if (!userId) return buildEmptyHeatmap(days);
  const today = getTodayMidnight();
  const start = addDays(today, -(days - 1));

  const rows = await prisma.dailyActivity.findMany({
    where: {
      user_id: userId,
      date: { gte: start, lte: today },
    },
    select: { date: true, count: true, xp: true },
  });

  const map = new Map<string, { count: number; xp: number }>();
  for (const r of rows) {
    const k = formatDateKey(new Date(r.date));
    map.set(k, { count: r.count, xp: r.xp });
  }

  const result: Array<{ date: string; count: number; xp: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const k = formatDateKey(d);
    const v = map.get(k);
    result.push({ date: k, count: v?.count ?? 0, xp: v?.xp ?? 0 });
  }
  return result;
}

function buildEmptyHeatmap(days: number): Array<{ date: string; count: number; xp: number }> {
  const today = getTodayMidnight();
  const start = addDays(today, -(days - 1));
  const arr: Array<{ date: string; count: number; xp: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    arr.push({ date: formatDateKey(d), count: 0, xp: 0 });
  }
  return arr;
}

export async function getTotalXp(userId: string): Promise<number> {
  if (!userId) return 0;
  const agg = await prisma.dailyActivity.aggregate({
    where: { user_id: userId },
    _sum: { xp: true, count: true },
  });
  return agg._sum.xp ?? 0;
}

export async function getTotalCount(userId: string): Promise<number> {
  if (!userId) return 0;
  const agg = await prisma.dailyActivity.aggregate({
    where: { user_id: userId },
    _sum: { count: true },
  });
  return agg._sum.count ?? 0;
}

export interface HeatmapEntry {
  date: string;
  count: number;
  xp: number;
}

export interface StreakData {
  streak: number;
  heatmap: HeatmapEntry[];
  heatmapMap: Record<string, number>;
  totalXp: number;
  totalCount: number;
  todayCount: number;
  todayXp: number;
}

export async function getStreakDataForUser(userId: string, days = 90): Promise<StreakData> {
  const [streak, heatmap, totalXp, totalCount] = await Promise.all([
    getStreak(userId),
    getHeatmap(userId, days),
    getTotalXp(userId),
    getTotalCount(userId),
  ]);
  // today
  const todayKey = formatDateKey(getTodayMidnight());
  const todayEntry = heatmap.find((h) => h.date === todayKey);
  return {
    streak,
    heatmap,
    // map date -> count tiện cho client
    heatmapMap: Object.fromEntries(heatmap.map((h) => [h.date, h.count])) as Record<string, number>,
    totalXp,
    totalCount,
    todayCount: todayEntry?.count ?? 0,
    todayXp: todayEntry?.xp ?? 0,
  };
}
