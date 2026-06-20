import "server-only";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Lightweight in-memory fixed-window rate limiter. Per-instance only (resets on
 * deploy / cold start), no external dependencies. Suitable for blunting
 * enumeration and abuse on individual routes; not a substitute for a durable
 * distributed limiter under heavy multi-instance load.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return { ok: false };
  }

  existing.count += 1;
  return { ok: true };
}

/** Best-effort client IP from forwarding headers; falls back to "unknown". */
export function clientIpFrom(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
