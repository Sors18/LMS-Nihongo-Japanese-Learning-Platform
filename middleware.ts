import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "lms_token";

// Giữ đồng bộ với lib/env.ts (Edge không import được server-only nên duplicate có chủ ý).
// Quy tắc duy nhất: prod bắt buộc NEXTAUTH_SECRET >= 32 ký tự; dev fallback kèm warn 1 lần.
const FALLBACK_SECRET = "lms-nihongo-secret-change-me";
let warnedFallback = false;

function getSecret(): string {
  const raw = (process.env.NEXTAUTH_SECRET ?? "").trim();
  if (raw) {
    if (raw.length < 32 && process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET quá ngắn (<32 ký tự)");
    }
    return raw;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Thiếu NEXTAUTH_SECRET khi production");
  }
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn("[middleware] NEXTAUTH_SECRET chưa set — dùng fallback dev-only.");
  }
  return FALLBACK_SECRET;
}

function base64UrlDecode(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  try {
    return atob(s);
  } catch {
    return "";
  }
}

function base64UrlToBytes(input: string): Uint8Array {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyJwtHS256(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const headerB64 = parts[0] ?? "";
  const payloadB64 = parts[1] ?? "";
  const signatureB64 = parts[2] ?? "";
  const data = `${headerB64}.${payloadB64}`;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = base64UrlToBytes(signatureB64);
    const dataBytes = enc.encode(data);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes.buffer as ArrayBuffer, dataBytes);
    if (!valid) return null;
    const json = base64UrlDecode(payloadB64);
    if (!json) return null;
    const payload = JSON.parse(json) as Record<string, unknown>;
    if (payload.exp !== undefined && typeof payload.exp === "number") {
      const now = Math.floor(Date.now() / 1000);
      if (now > payload.exp) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifyJwtHS256(token, getSecret());
  if (!payload) {
    const res = isApiPath(pathname)
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  }

  const role = typeof payload.role === "string" ? payload.role : "USER";
  const isAdminPath = pathname.startsWith("/admin");

  if (isAdminPath && role !== "ADMIN") {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/admin/users", "/admin/vocab", "/admin/grammar", "/flashcards", "/history", "/api/tokenize", "/api/vocab", "/chat", "/kanji", "/roadmap", "/streak"],
};
