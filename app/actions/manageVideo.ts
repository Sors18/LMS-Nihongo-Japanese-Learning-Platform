"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { Level } from "@prisma/client";

function extractYoutubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (u.searchParams.get("v")) {
      const v = u.searchParams.get("v")!;
      if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
    const m = s.match(/(?:youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  } catch {}
  const m2 = s.match(/([a-zA-Z0-9_-]{11})/);
  return m2 ? m2[1] : null;
}

export async function deleteVideoAction(videoId: number) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false as const, error: "Forbidden — chỉ ADMIN mới xóa được video" };
  }
  if (!videoId) return { ok: false as const, error: "Thiếu videoId" };
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) return { ok: false as const, error: "Không tìm thấy video" };
  await prisma.video.delete({ where: { id: videoId } });
  revalidatePath("/");
  revalidatePath("/admin/videos");
  revalidatePath("/admin/insert");
  revalidatePath("/admin/subtitle");
  return { ok: true as const };
}

export type UpdateVideoInput = {
  videoId: number;
  title: string;
  youtubeUrlOrId: string;
  level: Level;
  duration: number;
};

export async function updateVideoAction(input: UpdateVideoInput) {
  try {
    await requireAdmin();
  } catch {
    return { ok: false as const, error: "Forbidden — chỉ ADMIN mới sửa được video" };
  }
  if (!input.videoId) return { ok: false as const, error: "Thiếu videoId" };
  const youtube_id = extractYoutubeId(input.youtubeUrlOrId);
  if (!youtube_id) return { ok: false as const, error: "YouTube ID không hợp lệ" };
  if (!input.title.trim()) return { ok: false as const, error: "Thiếu tiêu đề" };
  if (!["N5", "N4", "N3", "N2", "N1"].includes(input.level)) return { ok: false as const, error: "Level không hợp lệ" };
  if (!input.duration || input.duration <= 0) return { ok: false as const, error: "Duration phải > 0" };

  const exists = await prisma.video.findUnique({ where: { id: input.videoId } });
  if (!exists) return { ok: false as const, error: "Không tìm thấy video" };

  const dup = await prisma.video.findUnique({ where: { youtube_id } });
  if (dup && dup.id !== input.videoId) return { ok: false as const, error: `YouTube ID đã dùng cho video #${dup.id}` };

  const updated = await prisma.video.update({
    where: { id: input.videoId },
    data: {
      title: input.title.trim(),
      youtube_id,
      level: input.level,
      duration: Math.floor(input.duration),
    },
  });

  revalidatePath("/");
  revalidatePath(`/video/${input.videoId}`);
  revalidatePath("/admin/videos");
  return { ok: true as const, video: updated };
}
