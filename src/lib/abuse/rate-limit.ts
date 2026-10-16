import { sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { abuseRateLimits } from "@/db/schema";

/**
 * P6.2 — DB-backed abuse quotas. One atomic upsert per attempt, so limits
 * hold across serverless instances (never in-memory counters). Bucket keys
 * embed scope + subject + window start, keyed on the authenticated user id —
 * never on IP alone, so users behind shared addresses are not treated as
 * identical. Throttled requests change no state and stay safely retryable.
 */

export const ABUSE_SCOPES = ["mission-submit", "campaign-claim", "reward-claim"] as const;

export type AbuseScope = (typeof ABUSE_SCOPES)[number];

/** Attempts allowed per rolling window. Anti-automation, not financial. */
export const ABUSE_LIMITS: Record<AbuseScope, { limit: number; windowMs: number }> = {
  // Quiz/text resubmission: generous for genuine retries, hostile to
  // brute-force answer cycling (auto-graded quizzes approve on pass).
  "mission-submit": { limit: 20, windowMs: 60 * 60 * 1_000 },
  // Campaign claims: legitimate use is a handful of attempts; P6.1
  // idempotency already makes retries safe, so the cap only bites hammers.
  "campaign-claim": { limit: 30, windowMs: 60 * 60 * 1_000 },
  "reward-claim": { limit: 30, windowMs: 60 * 60 * 1_000 },
};

export type AbuseQuotaResult = {
  allowed: boolean;
  /** Attempts left in this window (0 when throttled). */
  remaining: number;
  /** Milliseconds until the window rolls (0 when allowed). */
  retryAfterMs: number;
};

function bucketFor(scope: AbuseScope, userId: string, qualifier: string, windowMs: number, now: number): { key: string; windowStart: Date } {
  const cleanUser = userId.trim().slice(0, 80);
  const cleanQualifier = qualifier.trim().slice(0, 80);
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  return {
    key: `p62:${scope}:${cleanUser}:${cleanQualifier}:${windowStartMs}`,
    windowStart: new Date(windowStartMs),
  };
}

/**
 * Consume one attempt. Returns allowed=false (without throwing, without
 * touching any other state) when the quota is exhausted. Concurrency-safe:
 * a single conditional upsert decides, so simultaneous racers cannot each
 * observe a stale count.
 */
export async function consumeAbuseQuota(args: {
  scope: AbuseScope;
  userId: string;
  /** Narrows the bucket, e.g. mission id or campaign id. */
  qualifier?: string;
  limit?: number;
  windowMs?: number;
  now?: number;
}): Promise<AbuseQuotaResult> {
  const config = ABUSE_LIMITS[args.scope];
  const limit = args.limit ?? config.limit;
  const windowMs = args.windowMs ?? config.windowMs;
  const now = args.now ?? Date.now();
  const { key, windowStart } = bucketFor(args.scope, args.userId, args.qualifier ?? "", windowMs, now);
  const database = getDatabase();
  const [row] = await database
    .insert(abuseRateLimits)
    .values({ bucketKey: key, count: 1, windowStart })
    .onConflictDoUpdate({
      target: abuseRateLimits.bucketKey,
      set: { count: sql`${abuseRateLimits.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: abuseRateLimits.count });
  const count = row?.count ?? limit + 1;
  if (count <= limit) {
    return { allowed: true, remaining: limit - count, retryAfterMs: 0 };
  }
  return { allowed: false, remaining: 0, retryAfterMs: windowStart.getTime() + windowMs - now };
}

export class AbuseRateLimitError extends Error {
  readonly code = "rate-limited";
  readonly httpStatus = 429;
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Too many attempts right now. Wait a little and try again — nothing was charged or lost.");
    this.name = "AbuseRateLimitError";
    this.retryAfterMs = Math.max(0, retryAfterMs);
  }
}

/** Enforce a quota or throw a retry-safe 429 before any side effect. */
export async function requireAbuseQuota(args: {
  scope: AbuseScope;
  userId: string;
  qualifier?: string;
  limit?: number;
  windowMs?: number;
}): Promise<void> {
  const result = await consumeAbuseQuota(args);
  if (!result.allowed) throw new AbuseRateLimitError(result.retryAfterMs);
}
