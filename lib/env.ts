import "server-only";

/**
 * Central env validation — chặn JWT secret fallback cứng khi production.
 * - Dev: cho phép fallback kèm console.warn để DX XAMPP không gãy.
 * - Production: bắt buộc NEXTAUTH_SECRET >= 32 ký tự, throw nếu thiếu/yếu.
 */

const FALLBACK_SECRET = "lms-nihongo-secret-change-me";

function resolveSecret(): string {
  const raw = (process.env.NEXTAUTH_SECRET ?? "").trim();
  if (raw) {
    if (raw.length < 32 && process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXTAUTH_SECRET quá ngắn (<32 ký tự) — hãy tạo secret mạnh (openssl rand -base64 48)"
      );
    }
    return raw;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Thiếu NEXTAUTH_SECRET khi NODE_ENV=production — từ chối khởi động để tránh forge JWT"
    );
  }
  console.warn(
    "[env] NEXTAUTH_SECRET chưa set — dùng fallback dev-only. Đặt secret >=32 ký tự trước khi deploy."
  );
  return FALLBACK_SECRET;
}

let cached: string | null = null;

export function getJwtSecretStrict(): string {
  if (!cached) cached = resolveSecret();
  return cached;
}

/** Dùng cho middleware (Edge, không import server-only ở một số bản Next) — logic giống hệt. */
export function getJwtSecretForMiddleware(): string {
  return getJwtSecretStrict();
}
