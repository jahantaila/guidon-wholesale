/**
 * Minimal in-memory rate limiter. Tracks failed attempts per key over a
 * sliding window. Good enough for a single-server Next.js deploy; won't
 * survive process restarts and doesn't coordinate across Vercel serverless
 * instances. For production scale, swap the backing Map for Upstash Redis
 * (drop-in since the interface is async).
 */

type Bucket = {
  // Timestamps (ms epoch) of failed attempts within the window
  hits: number[];
  // If this is set and in the future, all attempts are rejected until then
  lockedUntil?: number;
};

const buckets = new Map<string, Bucket>();

// Tunables. Deliberately conservative for login: 5 failures in 10 minutes
// triggers a 15-minute lockout. Legitimate typo retries fit comfortably.
export const RATE_LIMIT_CONFIG = {
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxFailures: 5,
  lockoutMs: 15 * 60 * 1000, // 15 minutes
} as const;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number; reason: 'locked' | 'too_many' };

/**
 * Check whether a new attempt is allowed. Does NOT record a hit; call
 * recordFailure() after a failed attempt or clearKey() after a successful one.
 */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (bucket?.lockedUntil && bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterMs: bucket.lockedUntil - now,
      reason: 'locked',
    };
  }

  // Prune stale hits.
  const fresh = (bucket?.hits || []).filter((t) => now - t < RATE_LIMIT_CONFIG.windowMs);
  const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxFailures - fresh.length);

  if (remaining === 0) {
    return {
      allowed: false,
      retryAfterMs: RATE_LIMIT_CONFIG.lockoutMs,
      reason: 'too_many',
    };
  }
  return { allowed: true, remaining };
}

/**
 * Record a failed attempt. If this push crosses the threshold, arms the
 * lockout so subsequent checkRateLimit() calls refuse for lockoutMs.
 */
export function recordFailure(key: string): void {
  const now = Date.now();
  const existing = buckets.get(key);
  const fresh = (existing?.hits || []).filter((t) => now - t < RATE_LIMIT_CONFIG.windowMs);
  fresh.push(now);
  const nextBucket: Bucket = { hits: fresh };
  if (fresh.length >= RATE_LIMIT_CONFIG.maxFailures) {
    nextBucket.lockedUntil = now + RATE_LIMIT_CONFIG.lockoutMs;
  }
  buckets.set(key, nextBucket);
}

/**
 * Clear a key's bucket after a successful action.
 */
export function clearKey(key: string): void {
  buckets.delete(key);
}

/**
 * Extract a stable key from a request. Uses CF-Connecting-IP / X-Forwarded-For
 * if present (Vercel forwards the real client IP in these), falls back to a
 * generic constant so the limiter still functions in dev.
 */
export function keyForRequest(request: Request): string {
  const headers = request.headers;
  const ip =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  return `ip:${ip}`;
}
