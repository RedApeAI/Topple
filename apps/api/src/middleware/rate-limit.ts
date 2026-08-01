import type { MiddlewareHandler } from "hono";

import { env } from "../lib/env.js";
import type { AppEnv } from "../types.js";

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/** Failed sign-in attempts per account (email) — enables lockout. */
const failedLogins = new Map<
  string,
  { count: number; lockedUntil: number | null }
>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/**
 * In-memory sliding-window rate limiter, keyed by `${ip}:${route}`.
 *
 * Security note: this is per-process. It is a defense against accidental
 * bursts and casual abuse, NOT a substitute for a shared store (Redis) when
 * the API runs on multiple instances. Restarting the process clears counts.
 */
export function checkRateLimit(key: string): RateLimitResult {
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const max = env.RATE_LIMIT_MAX;

  const bucket = buckets.get(key) ?? { timestamps: [] };
  const now = Date.now();
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  if (bucket.timestamps.length > max) {
    const oldest = bucket.timestamps[0] ?? now;
    return { allowed: false, retryAfterMs: oldest + windowMs - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function getClientIp(context: {
  req: { header: (name: string) => string | undefined };
}): string {
  return (
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    context.req.header("cf-connecting-ip") ||
    context.req.header("x-real-ip") ||
    "unknown"
  );
}

/** Apply rate limiting to a route handler, keyed per IP + route path. */
export function rateLimit(options?: {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
}): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const windowMs = options?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
    const max = options?.max ?? env.RATE_LIMIT_MAX;
    const ip = getClientIp(context);
    const key = `${options?.keyPrefix ?? "rl"}:${ip}:${context.req.path}`;

    const bucket = buckets.get(key) ?? { timestamps: [] };
    const now = Date.now();
    const cutoff = now - windowMs;
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    bucket.timestamps.push(now);
    buckets.set(key, bucket);

    if (bucket.timestamps.length > max) {
      const oldest = bucket.timestamps[0] ?? now;
      const retryAfterMs = Math.max(1, oldest + windowMs - now);
      context.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      return context.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            retryAfterMs,
          },
        },
        429,
      );
    }

    await next();
  };
}

// --------------------------------------------------------------------------- //
// Per-account lockout for credential-stuffing protection.
// --------------------------------------------------------------------------- //

export function isAccountLocked(email: string): {
  locked: boolean;
  retryAfterMs: number;
} {
  const record = failedLogins.get(email.toLowerCase());
  if (!record) return { locked: false, retryAfterMs: 0 };
  if (record.lockedUntil !== null && record.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
  }
  if (record.lockedUntil !== null && record.lockedUntil <= Date.now()) {
    // Lock expired — reset the counter for a fresh window.
    failedLogins.delete(email.toLowerCase());
    return { locked: false, retryAfterMs: 0 };
  }
  return { locked: false, retryAfterMs: 0 };
}

export function recordFailedLogin(email: string): {
  lockedUntil: number | null;
} {
  const key = email.toLowerCase();
  const now = Date.now();
  const record = failedLogins.get(key) ?? {
    count: 0,
    lockedUntil: null,
  };

  if (record.lockedUntil !== null && record.lockedUntil > now) {
    return { lockedUntil: record.lockedUntil };
  }

  if (record.lockedUntil !== null && record.lockedUntil <= now) {
    record.count = 0;
    record.lockedUntil = null;
  }

  record.count += 1;
  const threshold = env.AUTH_LOCKOUT_THRESHOLD;

  if (record.count >= threshold) {
    record.lockedUntil = now + env.AUTH_LOCKOUT_DURATION_MS;
    failedLogins.set(key, {
      count: record.count,
      lockedUntil: record.lockedUntil,
    });
    return { lockedUntil: record.lockedUntil };
  }

  failedLogins.set(key, { count: record.count, lockedUntil: null });
  return { lockedUntil: null };
}

export function clearFailedLogins(email: string): void {
  failedLogins.delete(email.toLowerCase());
}

/** Reset all in-memory auth state (used by tests). */
export function resetAuthSecurityState(): void {
  buckets.clear();
  failedLogins.clear();
}
