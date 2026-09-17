import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { betaPasses, betaPassRedemptions, type BetaPass } from "@/lib/db/schema";

// Beta passes: the one door through the under-development gate (#239) and,
// once #240 lands, the thing that grants a tester their free credits. One
// mechanism on purpose — two access systems that must agree are how they
// come to disagree.
//
// A pass is used by visiting /beta/<code>, which sets this cookie; the
// Auth.js signIn callback reads it when a sign-in would create a new
// account. The cookie is the code itself: it is a capability, not a secret
// the server could be tricked into honouring for someone else, and it is
// checked against the table on every use, so a revoked pass stops working
// even in a browser that still holds it.
export const BETA_PASS_COOKIE = "flatpare_beta_pass";
// Long enough to click the link on one day and sign in the next; short
// enough that a shared device does not hold the door open for weeks.
export const BETA_PASS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

// 32 hex characters from a v4 UUID: 122 bits of entropy, unguessable, and
// safe in a URL without encoding. Not `crypto.getRandomValues` — that is
// reserved for src/lib/crypto by the layering rule; `randomUUID` is what
// src/lib/household-data/ids.ts uses for the same reason.
export function newBetaPassCode(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export interface CreateBetaPassInput {
  label?: string | null;
  credits?: number;
  maxUses?: number | null;
  expiresAt?: Date | null;
}

export async function createBetaPass(
  input: CreateBetaPassInput = {}
): Promise<BetaPass> {
  const [row] = await db
    .insert(betaPasses)
    .values({
      code: newBetaPassCode(),
      label: input.label ?? null,
      credits: input.credits ?? 40,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row;
}

// Whether a pass currently admits a new sign-up. A pure function of the row
// so the route that sets the cookie and the callback that honours it agree.
export function isBetaPassUsable(pass: BetaPass, now = new Date()): boolean {
  if (pass.revokedAt !== null) return false;
  if (pass.expiresAt !== null && pass.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  if (pass.maxUses !== null && pass.uses >= pass.maxUses) return false;
  return true;
}

export async function findBetaPass(code: string): Promise<BetaPass | null> {
  if (!code) return null;
  const rows = await db
    .select()
    .from(betaPasses)
    .where(eq(betaPasses.code, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUsableBetaPass(code: string): Promise<BetaPass | null> {
  const pass = await findBetaPass(code);
  return pass !== null && isBetaPassUsable(pass) ? pass : null;
}

// Consumes one use, atomically. Returns the pass, or null when it could not
// be used — unknown, revoked, expired or exhausted.
//
// A single guarded UPDATE rather than a read-then-write: two people opening
// the last use of a one-use link at the same moment would otherwise both
// get in. Not wrapped in db.transaction — parallel transactions on libSQL
// abort with SQLITE_BUSY (#225), and one statement needs none.
export async function consumeBetaPassUse(code: string): Promise<BetaPass | null> {
  if (!code) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rows = await db
    .update(betaPasses)
    .set({ uses: sql`${betaPasses.uses} + 1` })
    .where(
      and(
        eq(betaPasses.code, code),
        isNull(betaPasses.revokedAt),
        sql`(${betaPasses.expiresAt} IS NULL OR ${betaPasses.expiresAt} > ${nowSeconds})`,
        sql`(${betaPasses.maxUses} IS NULL OR ${betaPasses.uses} < ${betaPasses.maxUses})`
      )
    )
    .returning();
  return rows[0] ?? null;
}

// Records which pass let a user in. Idempotent on the user: a person signs
// up once, and a second call for the same user is a no-op rather than an
// error, because the Auth.js event that triggers it can, in principle, fire
// more than once for one account.
export async function recordBetaPassRedemption(
  passId: number,
  userId: string
): Promise<void> {
  await db
    .insert(betaPassRedemptions)
    .values({ passId, userId })
    .onConflictDoNothing();
}

export async function findBetaPassRedemption(
  userId: string
): Promise<{ passId: number; userId: string } | null> {
  const rows = await db
    .select({
      passId: betaPassRedemptions.passId,
      userId: betaPassRedemptions.userId,
    })
    .from(betaPassRedemptions)
    .where(eq(betaPassRedemptions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

// Stops the link admitting anyone new. Never touches redemptions or anything
// granted through them — decided on #240: access conferred is permanent.
export async function revokeBetaPass(code: string): Promise<boolean> {
  const rows = await db
    .update(betaPasses)
    .set({ revokedAt: new Date() })
    .where(and(eq(betaPasses.code, code), isNull(betaPasses.revokedAt)))
    .returning({ id: betaPasses.id });
  return rows.length > 0;
}
