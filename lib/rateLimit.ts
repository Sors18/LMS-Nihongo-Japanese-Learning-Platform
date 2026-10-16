/**
 * Rate-limit in-memory (sliding window) cho API Routes.
 * - Best-effort single-instance: đủ chống spam Gemini/TTS/bcrypt trong đồ án.
 *   Deploy multi-instance (Vercel scale) nên thay bằng Upstash Redis — interface giữ nguyên.
 * - Key nên là IP (+ user id nếu đã auth) để 1 IP không ké hết quota người khác.
 *
 * Chống bypass qua header giả mạo:
 * - Mặc định KHÔNG tin `x-forwarded-for` / `x-real-ip` (client tự gửi được).
 *   Chỉ tin khi chạy sau proxy tin cậy: đặt `TRUST_PROXY=1` (Nginx/Cloudflare).
 * - Mọi scope đều có thêm bucket GLOBAL (tổng mọi key) với hạn mức gấp
 *   GLOBAL_MULTIPLIER lần — attacker xoay IP/user vẫn bị chặn ở mức tổng.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const globalBuckets = new Map<string, Bucket>();

/** Số nhân cho bucket global so với limit per-key (chặn xoay IP). */
const GLOBAL_MULTIPLIER = 20;
/** Cap số bucket để attacker đổi key liên tục không OOM. */
const MAX_BUCKETS = 5000;

function trustProxy(): boolean {
  return (process.env.TRUST_PROXY ?? "").trim() === "1";
}

function clientIp(req: Request): string {
  // Chỉ tin header forward khi admin xác nhận chạy sau proxy tin cậy.
  if (trustProxy()) {
    const h = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
    if (h) return h.slice(0, 64);
    const real = (req.headers.get("x-real-ip") ?? "").trim();
    if (real) return real.slice(0, 64);
  }
  // Không tin được IP thật → mọi request chung 1 key (an toàn hơn là tin header giả).
  // Per-user key (khi đã auth) vẫn phân biệt được từng tài khoản.
  return "direct";
}

export function rateKey(req: Request, scope: string, userId?: string): string {
  return `${scope}:${userId ?? clientIp(req)}`;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

function pruneHits(b: Bucket, cutoff: number): void {
  let write = 0;
  for (let i = 0; i < b.hits.length; i++) {
    if (b.hits[i]! > cutoff) b.hits[write++] = b.hits[i]!;
  }
  b.hits.length = write;
}

function getBucket(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { hits: [] };
    map.set(key, b);
  }
  return b;
}

/**
 * Kiểm tra + ghi nhận 1 hit.
 * - key dạng `scope:...` → tự suy scope để áp thêm bucket global `g:scope`.
 * - Bị chặn khi vượt EITHER per-key limit OR global limit.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const scope = key.split(":")[0] ?? "misc";
  const cutoff = now - windowMs;

  const b = getBucket(buckets, key);
  pruneHits(b, cutoff);
  if (b.hits.length >= limit) {
    const oldest = b.hits[0] ?? now;
    return { allowed: false, remaining: 0, resetMs: Math.max(0, oldest + windowMs - now) };
  }

  const gb = getBucket(globalBuckets, `g:${scope}:${windowMs}`);
  pruneHits(gb, cutoff);
  const globalLimit = Math.max(limit, limit * GLOBAL_MULTIPLIER);
  if (gb.hits.length >= globalLimit) {
    const oldest = gb.hits[0] ?? now;
    return { allowed: false, remaining: 0, resetMs: Math.max(0, oldest + windowMs - now) };
  }

  b.hits.push(now);
  gb.hits.push(now);
  return { allowed: true, remaining: limit - b.hits.length, resetMs: windowMs };
}

/** Dọn bucket trống định kỳ — gọi lười để Map không phình. */
let lastSweep = 0;
export function sweepRateBuckets(now = Date.now()): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [map] of [[buckets], [globalBuckets]] as const) {
    map.forEach((b, k) => {
      if (b.hits.length === 0) map.delete(k);
    });
    if (map.size > MAX_BUCKETS) {
      const over = map.size - MAX_BUCKETS;
      let n = 0;
      for (const k of map.keys()) {
        map.delete(k);
        if (++n >= over) break;
      }
    }
  }
}

/** Preset cho từng API — tốn tiền/quota khác nhau nên limit khác nhau. */
export const RATE_PRESETS = {
  // AI tốn quota: chat 20/phút, extract 5/phút
  chat: { limit: 20, windowMs: 60_000 },
  extract: { limit: 5, windowMs: 60_000 },
  // Nhẹ: tokenize/vocab/tts 60/phút (user đăng nhập)
  standard: { limit: 60, windowMs: 60_000 },
  // Khách vãng lai (chưa đăng nhập): strict hơn để khó abuse hover-lookup
  anon: { limit: 15, windowMs: 60_000 },
  // Auth: chống dò pass / tạo acc hàng loạt — 10/phút
  auth: { limit: 10, windowMs: 60_000 },
} as const;

export function rateLimitedResponse(resetMs: number): Response {
  const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
  return Response.json(
    { error: `Quá nhiều request — thử lại sau ${retryAfter}s` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
