import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1"]);

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null);

    let email = "";
    let password = "";
    let name = "";
    let target_level = "N4";

    if (raw && typeof raw === "object") {
      if ("email" in raw && typeof raw.email === "string") email = raw.email.trim().toLowerCase();
      if ("password" in raw && typeof raw.password === "string") password = raw.password;
      if ("name" in raw && typeof raw.name === "string") name = raw.name.trim();
      if ("target_level" in raw && typeof raw.target_level === "string") {
        const tl = raw.target_level.trim().toUpperCase();
        if (VALID_LEVELS.has(tl)) target_level = tl;
      }
    }

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Thiếu email, password hoặc tên" }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Mật khẩu phải ít nhất 6 ký tự" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email đã tồn tại" }, { status: 400 });
    }

    const password_hash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password_hash,
        name,
        target_level: target_level as "N5" | "N4" | "N3" | "N2" | "N1",
        role: "USER",
      },
    });

    const token = createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: (user as unknown as { role: string }).role ?? "USER",
      target_level: user.target_level,
    });

    const res = NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: (user as unknown as { role: string }).role ?? "USER",
          target_level: user.target_level,
        },
      },
      { status: 201 }
    );

    res.cookies.set("lms_token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi đăng ký";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
