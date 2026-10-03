"use server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  updateDailyActivity,
  getStreakDataForUser,
  getStreak,
  getHeatmap,
  getTotalXp,
} from "@/lib/streak";
import type { StreakData, HeatmapEntry } from "@/lib/streak";

/**
 * Ghi nhận hoạt động hôm nay cho user hiện tại
 * Được gọi khi xem hết video / làm flashcard / test / kanji
 * Tự tạo user row nếu chưa tồn tại (giống pattern flashcard/test)
 */
export async function recordActivity(): Promise<{ ok: boolean; xp?: number; count?: number; error?: string }> {
  const cu = await getCurrentUser();
  if (!cu) return { ok: false, error: "Chưa đăng nhập" };

  // Đảm bảo user tồn tại trong DB (tránh FK lỗi nếu user chỉ có JWT)
  try {
    await prisma.user.upsert({
      where: { id: cu.id },
      update: {},
      create: {
        id: cu.id,
        email: cu.email,
        password_hash: "demo",
        name: cu.name ?? cu.email,
        target_level: (cu as unknown as { target_level?: "N5" | "N4" | "N3" | "N2" | "N1" }).target_level ?? "N4",
      },
    });
  } catch {
    // fallback tìm theo email
    const byEmail = await prisma.user.findUnique({ where: { email: cu.email } });
    if (!byEmail) return { ok: false, error: "Không tìm thấy user" };
    // Dùng id thực tế từ DB để ghi activity
    const row = await updateDailyActivity(byEmail.id);
    return { ok: true, xp: (row as { xp?: number })?.xp, count: (row as { count?: number })?.count };
  }

  const userId = cu.id;
  // Ưu tiên dùng id từ JWT, nhưng nếu DB có id khác theo email thì đã upsert ở trên
  const row = await updateDailyActivity(userId);
  if (!row) return { ok: false, error: "Không ghi được activity" };
  return { ok: true, xp: (row as { xp: number }).xp, count: (row as { count: number }).count };
}

/**
 * Lấy streak + heatmap + XP cho user hiện tại
 * Dùng cho StreakFire component và trang /streak
 */
export async function getStreakData(days = 90): Promise<StreakData & { authenticated: boolean }> {
  const cu = await getCurrentUser();
  if (!cu) {
    // trả về rỗng để UI hiện trạng thái chưa đăng nhập
    const empty = await getStreakDataForUser("__no_user__", days);
    // Nếu không có user, heatmap vẫn rỗng nhưng authenticated=false để UI phân biệt
    return { ...empty, streak: 0, totalXp: 0, totalCount: 0, todayCount: 0, todayXp: 0, authenticated: false };
  }

  // đảm bảo user row tồn tại để aggregate không lỗi
  try {
    await prisma.user.upsert({
      where: { id: cu.id },
      update: {},
      create: {
        id: cu.id,
        email: cu.email,
        password_hash: "demo",
        name: cu.name ?? cu.email,
        target_level: (cu as unknown as { target_level?: "N5" | "N4" | "N3" | "N2" | "N1" }).target_level ?? "N4",
      },
    });
  } catch {}

  const data = await getStreakDataForUser(cu.id, days);
  return { ...data, authenticated: true };
}

// Re-export helpers cho server imports trực tiếp nếu cần
export { getStreak, getHeatmap, getTotalXp };
export type { StreakData, HeatmapEntry };
