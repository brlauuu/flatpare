import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";

// Rate limiting for the /api/process/* blind proxies. These endpoints spend
// the host's Gemini and Maps budget on behalf of any signed-in member, and
// since E1 anyone can self-register, so an unbounded caller is a bill.
//
// Fixed one-hour windows rather than a sliding log: the goal is bounding
// spend, not smoothing traffic, and a fixed window is a single atomic upsert
// — no read-modify-write, so concurrent requests cannot both see "4 of 5".
//
// State lives in `process_usage` (Turso), not in memory: serverless instances
// come and go and there is no Redis in this stack, so a per-instance counter
// would reset unpredictably and count nothing useful.

export type ProcessEndpoint = "geocode" | "distance" | "check-listing" | "parse-pdf";

const WINDOW_SECONDS = 3600;

export class RateLimitConfigError extends Error {
  constructor(raw: string) {
    super(
      `PROCESS_RATE_LIMIT_PER_HOUR must be a positive integer or unset, got "${raw}". ` +
        "Unset (or empty) means unlimited, which is the self-hosted default."
    );
    this.name = "RateLimitConfigError";
  }
}

// null means unlimited. Unset is the self-hoster's default and must stay
// working with no configuration — `docker compose up` must not start
// refusing requests. The hosted deployment sets an explicit value.
//
// Read per call rather than at module load so tests and a redeploy can change
// it without a cold start, matching readEncryptionMode's posture.
export function processRateLimitPerHour(): number | null {
  const raw = process.env.PROCESS_RATE_LIMIT_PER_HOUR;
  if (raw === undefined || raw.trim() === "") return null;
  const trimmed = raw.trim();
  // Deliberately strict: Number("1e3") and Number(" 1.5 ") both produce
  // something, and silently accepting them would make the configured ceiling
  // differ from the one the operator wrote.
  if (!/^[1-9]\d*$/.test(trimmed)) throw new RateLimitConfigError(raw);
  return Number(trimmed);
}

export function currentWindowStart(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
}

// Counts one call against (household, endpoint, hour) and throws
// ApiError("Rate limit exceeded", 429) when it would exceed the ceiling.
// Returns normally — and writes nothing at all — when no limit is configured.
export async function consumeRateLimit(
  householdId: number,
  endpoint: ProcessEndpoint
): Promise<void> {
  const limit = processRateLimitPerHour();
  if (limit === null) return;

  const windowStart = currentWindowStart();
  // One statement: insert the first call of the window, or increment. The
  // returned count is this call's own position, so the comparison below is
  // race-free without a transaction.
  const result = await db.run(sql`
    INSERT INTO process_usage (household_id, endpoint, window_start, count)
    VALUES (${householdId}, ${endpoint}, ${windowStart}, 1)
    ON CONFLICT (household_id, endpoint, window_start)
    DO UPDATE SET count = count + 1
    RETURNING count
  `);

  const count = Number(result.rows?.[0]?.count ?? 0);
  if (count > limit) {
    throw new ApiError("Rate limit exceeded", 429);
  }
}
