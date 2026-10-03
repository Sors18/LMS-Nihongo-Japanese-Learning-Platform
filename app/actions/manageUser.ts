"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { Role, Level } from "@prisma/client";

const VALID_ROLES: Role[] = ["USER", "ADMIN"];
const VALID_LEVELS: Level[] = ["N5", "N4", "N3", "N2", "N1"];

type ActionResult<T = unknown> = { ok: true; data?: T; user?: unknown; users?: unknown } & Record<string, unknown> | { ok: false; error: string };

function handleAuthError(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Unauthorized") return { ok: false as const, error: "Unauthorized — vui lòng đăng nhập" };
  if (msg === "Forbidden") return { ok: false as const, error: "Forbidden — chỉ ADMIN mới thực hiện được" };
  return { ok: false as const, error: msg };
}

// List users
export async function listUsers() {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }
  try {
    const users = await prisma.user.findMany({
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        target_level: true,
        created_at: true,
      },
    });
    return { ok: true as const, users };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// Create user (admin only)
export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: string;
  target_level: string;
}) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  const emailRaw = (input?.email ?? "").trim().toLowerCase();
  const password = input?.password ?? "";
  const nameRaw = (input?.name ?? "").trim();
  const roleRaw = (input?.role ?? "").trim().toUpperCase();
  const levelRaw = (input?.target_level ?? "").trim().toUpperCase();

  if (!emailRaw) return { ok: false as const, error: "Thiếu email" };
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(emailRaw)) return { ok: false as const, error: "Email không hợp lệ" };

  if (!password) return { ok: false as const, error: "Thiếu password" };
  if (password.length < 6) return { ok: false as const, error: "Mật khẩu phải ít nhất 6 ký tự" };

  if (!nameRaw) return { ok: false as const, error: "Tên không được để trống" };
  if (nameRaw.length > 100) return { ok: false as const, error: "Tên quá dài (tối đa 100 ký tự)" };

  if (!roleRaw) return { ok: false as const, error: "Thiếu role" };
  if (!VALID_ROLES.includes(roleRaw as Role)) return { ok: false as const, error: "Role không hợp lệ — chỉ USER hoặc ADMIN" };

  if (!levelRaw) return { ok: false as const, error: "Thiếu target_level" };
  if (!VALID_LEVELS.includes(levelRaw as Level)) return { ok: false as const, error: "Level không hợp lệ — chỉ N5..N1" };

  try {
    const existing = await prisma.user.findUnique({ where: { email: emailRaw } });
    if (existing) return { ok: false as const, error: "Email đã tồn tại" };

    const password_hash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: emailRaw,
        password_hash,
        name: nameRaw,
        role: roleRaw as Role,
        target_level: levelRaw as Level,
      },
      select: { id: true, email: true, name: true, role: true, target_level: true, created_at: true },
    });

    revalidatePath("/admin/users");
    return { ok: true as const, user };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// Helper to normalize args: support both (userId, value) and ({ userId, role/level/name })
function normalizeTwoArgs<T extends string>(a1: string | { userId: string; role?: string; level?: string; name?: string }, a2?: T): { userId: string; value: T } | null {
  if (typeof a1 === "object" && a1 !== null && "userId" in a1) {
    const v = (a1 as Record<string, unknown>).role ?? (a1 as Record<string, unknown>).level ?? (a1 as Record<string, unknown>).name ?? a2;
    return { userId: String(a1.userId), value: String(v) as T };
  }
  if (typeof a1 === "string" && typeof a2 === "string") {
    return { userId: a1, value: a2 as T };
  }
  return null;
}

export async function updateUserRole(userId: string | { userId: string; role: string }, role?: string) {
  let uid: string;
  let r: string;
  const norm = normalizeTwoArgs<string>(userId as unknown as string | { userId: string; role: string }, role as string);
  if (!norm) return { ok: false as const, error: "Thiếu tham số userId/role" };
  uid = norm.userId;
  r = norm.value;

  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  if (!uid) return { ok: false as const, error: "Thiếu userId" };
  if (!VALID_ROLES.includes(r as Role)) return { ok: false as const, error: "Role không hợp lệ — chỉ USER hoặc ADMIN" };

  try {
    const existing = await prisma.user.findUnique({ where: { id: uid } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy user" };

    const updated = await prisma.user.update({
      where: { id: uid },
      data: { role: r as Role },
      select: { id: true, email: true, name: true, role: true, target_level: true, created_at: true },
    });

    revalidatePath("/admin/users");
    return { ok: true as const, user: updated };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateUserLevel(userId: string | { userId: string; level: string }, level?: string) {
  let uid: string;
  let lv: string;
  const norm = normalizeTwoArgs<string>(userId as unknown as string | { userId: string; level: string }, level as string);
  if (!norm) return { ok: false as const, error: "Thiếu tham số userId/level" };
  uid = norm.userId;
  lv = norm.value;

  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  if (!uid) return { ok: false as const, error: "Thiếu userId" };
  if (!VALID_LEVELS.includes(lv as Level)) return { ok: false as const, error: "Level không hợp lệ — chỉ N5..N1" };

  try {
    const existing = await prisma.user.findUnique({ where: { id: uid } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy user" };

    const updated = await prisma.user.update({
      where: { id: uid },
      data: { target_level: lv as Level },
      select: { id: true, email: true, name: true, role: true, target_level: true, created_at: true },
    });

    revalidatePath("/admin/users");
    return { ok: true as const, user: updated };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteUser(userId: string | { userId: string }) {
  let uid: string;
  if (typeof userId === "object" && userId !== null && "userId" in (userId as Record<string, unknown>)) {
    uid = String((userId as { userId: string }).userId);
  } else if (typeof userId === "string") {
    uid = userId;
  } else {
    return { ok: false as const, error: "Thiếu userId" };
  }

  let current: { id: string } | null = null;
  try {
    current = await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  if (!uid) return { ok: false as const, error: "Thiếu userId" };

  // Prevent self-deletion
  if (current && current.id === uid) {
    return { ok: false as const, error: "Không thể xóa chính mình" };
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: uid } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy user" };

    await prisma.user.delete({ where: { id: uid } });

    revalidatePath("/admin/users");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateUserName(userId: string | { userId: string; name: string }, name?: string) {
  let uid: string;
  let n: string;
  const norm = normalizeTwoArgs<string>(userId as unknown as string | { userId: string; name: string }, name as string);
  if (!norm) return { ok: false as const, error: "Thiếu tham số userId/name" };
  uid = norm.userId;
  n = norm.value;

  try {
    await requireAdmin();
  } catch (e) {
    return handleAuthError(e);
  }

  if (!uid) return { ok: false as const, error: "Thiếu userId" };
  const trimmed = (n ?? "").trim();
  if (!trimmed) return { ok: false as const, error: "Tên không được để trống" };
  if (trimmed.length > 100) return { ok: false as const, error: "Tên quá dài (tối đa 100 ký tự)" };

  try {
    const existing = await prisma.user.findUnique({ where: { id: uid } });
    if (!existing) return { ok: false as const, error: "Không tìm thấy user" };

    const updated = await prisma.user.update({
      where: { id: uid },
      data: { name: trimmed },
      select: { id: true, email: true, name: true, role: true, target_level: true, created_at: true },
    });

    revalidatePath("/admin/users");
    return { ok: true as const, user: updated };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
