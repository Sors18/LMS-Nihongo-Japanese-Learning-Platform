import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { getJwtSecretStrict } from "./env";

const COOKIE_NAME = "lms_token";
const JWT_EXPIRES_IN = "7d";

function getSecret(): string {
  return getJwtSecretStrict();
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  target_level: "N5" | "N4" | "N3" | "N2" | "N1";
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  target_level: string;
}): string {
  const secret = getSecret();
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    target_level: user.target_level,
  };
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

export async function getCurrentUser(req?: NextRequest | Request): Promise<CurrentUser | null> {
  let token: string | undefined;

  if (req) {
    try {
      const maybeNextReq = req as NextRequest;
      // NextRequest has cookies.get
      if (typeof (maybeNextReq as unknown as { cookies?: { get?: (name: string) => { value: string } | undefined } }).cookies?.get === "function") {
        token = maybeNextReq.cookies.get(COOKIE_NAME)?.value;
      } else {
        // Generic Request fallback: parse Cookie header
        const cookieHeader = (req as Request).headers.get("cookie") || "";
        const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
        if (match) token = decodeURIComponent(match[1]);
      }
    } catch {
      // ignore
    }
  } else {
    try {
      const store = await cookies();
      token = store.get(COOKIE_NAME)?.value;
    } catch {
      return null;
    }
  }

  if (!token) return null;

  try {
    const secret = getSecret();
    const decoded = jwt.verify(token, secret) as Record<string, unknown>;
    if (!decoded || typeof decoded !== "object") return null;
    const id = (decoded as { id?: unknown }).id;
    const email = (decoded as { email?: unknown }).email;
    if (!id || !email) return null;
    const name = (decoded as { name?: unknown }).name;
    const role = (decoded as { role?: unknown }).role;
    const target_level = (decoded as { target_level?: unknown }).target_level;
    return {
      id: String(id),
      email: String(email),
      name: String(name ?? email),
      role: role === "ADMIN" ? "ADMIN" : "USER",
      target_level: (["N5", "N4", "N3", "N2", "N1"].includes(String(target_level)) ? String(target_level) : "N4") as CurrentUser["target_level"],
    };
  } catch {
    return null;
  }
}

export async function authenticate(email: string, password: string): Promise<CurrentUser | null> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return null;
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: ((user as unknown as { role?: string }).role === "ADMIN" ? "ADMIN" : "USER") as CurrentUser["role"],
    target_level: (user.target_level as unknown as CurrentUser["target_level"]) ?? "N4",
  };
}

export async function requireAuth(req?: NextRequest | Request): Promise<CurrentUser> {
  const user = await getCurrentUser(req as NextRequest);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin(req?: NextRequest | Request): Promise<CurrentUser> {
  const user = await requireAuth(req as NextRequest);
  if (user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}

// helper for API routes to set cookie header convenience
export const AUTH_COOKIE_NAME = COOKIE_NAME;
export function getJwtSecret(): string {
  return getSecret();
}
