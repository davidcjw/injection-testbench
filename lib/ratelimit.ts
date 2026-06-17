import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let limiter: Ratelimit | null = null;
let resolved = false;

/** Build the limiter lazily. If Upstash env vars aren't set (local dev, forks,
 *  self-host), rate limiting is disabled and every request is allowed — the app
 *  still works, it just isn't protected. Configure it on the public deploy. */
function getLimiter(): Ratelimit | null {
  if (resolved) return limiter;
  resolved = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return (limiter = null);
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    // Per-IP sliding window. A full run is ~4 batch requests, so this allows
    // roughly a few full runs per window — tune to taste.
    limiter: Ratelimit.slidingWindow(30, "10 m"),
    prefix: "itb",
    analytics: false,
  });
  return limiter;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry (only when blocked). */
  retryAfter?: number;
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const l = getLimiter();
  if (!l) return { ok: true };
  const { success, reset } = await l.limit(identifier);
  if (success) return { ok: true };
  return { ok: false, retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
}
