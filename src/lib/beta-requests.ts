import { gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { betaRequests } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { emailEnabled, sendEmail } from "@/lib/email";
import { betaRequestEmail } from "@/lib/email-templates";
import { SITE_URL } from "@/lib/site";

// Beta-invite requests from the landing page (#301). Anyone can post one —
// the person asking has no account — so the endpoint is public and the
// limits live here:
//
//   - one row per address; asking twice is a no-op, and the caller gets the
//     same answer either way, so the form cannot be used to learn whether
//     an address has already asked;
//   - at most BETA_REQUESTS_PER_DAY new rows in any 24 hours, site-wide,
//     which bounds both the table and the notification emails. Real beta
//     demand is a handful a day; past the cap the form says to try later.
export const BETA_REQUESTS_PER_DAY = 50;

export type BetaRequestOutcome =
  | { created: true; id: number; email: string }
  | { created: false };

// Addresses are compared case-insensitively in practice, so they are stored
// that way: `Ana@Example.com` and `ana@example.com` are one request.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// One statement: insert only while under the daily cap, and do nothing on a
// repeat address. The conditional INSERT ... SELECT is atomic, so concurrent
// requests at 49 of 50 cannot both take the last slot (the same reasoning as
// createApartmentRow; do not split it into count-then-insert).
export async function recordBetaRequest(rawEmail: string): Promise<BetaRequestOutcome> {
  const email = normalizeEmail(rawEmail);
  const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  const inserted = await db.all<{ id: number }>(sql`
    INSERT INTO beta_requests (email)
    SELECT ${email}
    WHERE (SELECT COUNT(*) FROM beta_requests WHERE created_at > ${since}) < ${BETA_REQUESTS_PER_DAY}
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `);
  if (inserted.length > 0) return { created: true, id: Number(inserted[0].id), email };

  // Nothing inserted: either the address already asked, or the cap is
  // reached. While capped, every request gets the 429 — known address or
  // not — so the answer still says nothing about who has asked.
  const recent = await db
    .select({ n: sql<number>`count(*)` })
    .from(betaRequests)
    .where(gt(betaRequests.createdAt, new Date(since * 1000)));
  if (Number(recent[0]?.n ?? 0) >= BETA_REQUESTS_PER_DAY) {
    throw new ApiError("Too many requests today. Please try again tomorrow.", 429);
  }
  return { created: false };
}

export type BetaRequestNotice = "sent" | "failed" | "off";

// Where the owner is told about a new request. Unset means no notification:
// the request is stored either way and `beta-pass.mjs requests` lists it.
export function betaRequestNotifyAddress(): string | null {
  return process.env.BETA_REQUEST_NOTIFY_EMAIL?.trim() || null;
}

// Tells the owner. The row already exists, so this reports and never throws:
// a mail provider being down must not turn a stored request into an error.
export async function notifyOwnerOfBetaRequest(request: {
  id: number;
  email: string;
}): Promise<BetaRequestNotice> {
  const to = betaRequestNotifyAddress();
  if (!to || !emailEnabled()) return "off";
  const result = await sendEmail({
    to,
    ...betaRequestEmail({ requesterEmail: request.email, siteUrl: SITE_URL }),
    idempotencyKey: `beta-request/${request.id}`,
  });
  return result.sent ? "sent" : result.reason;
}
