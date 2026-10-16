import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, rateKey, rateLimitedResponse, sweepRateBuckets, RATE_PRESETS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(
    rateKey(req as unknown as Request, "login"),
    RATE_PRESETS.auth.limit,
    RATE_PRESETS.auth.windowMs
  );
  sweepRateBuckets();
  if (!rl.allowed) return rateLimitedResponse(rl.resetMs);
  try {
    const raw = await req.json().catch(() => null);
    let email = "";
    let password = "";
    if (raw && typeof raw === "object") {
      if ("email" in raw) {
        const v = raw.email;
        if (typeof v === "string") email = v.trim().toLowerCase();
      }
      if ("password" in raw) {
        const v = raw.password;
        if (typeof v === "string") password = v;
      }
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Thiếu email hoặc password" }, { status: 400 });
    }
    // Chặn payload quá khổ + email sai định dạng trước khi chạm DB/bcrypt
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
    }
    // bcrypt chỉ dùng 72 byte đầu — đồng bộ với register để tránh nhầm lẫn
    if (password.length > 72) {
      return NextResponse.json({ error: "Password quá dài (tối đa 72 ký tự)" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
    }

    const roleValue = "role" in user ? (user as unknown as { role: string }).role : "USER";
    const token = createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: roleValue ?? "USER",
      target_level: user.target_level,
    });

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: roleValue ?? "USER",
        target_level: user.target_level,
      },
    });

    res.cookies.set("lms_token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi đăng nhập";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
