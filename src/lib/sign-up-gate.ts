import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { readPublicAccess } from "@/lib/public-access";
import {
  BETA_PASS_COOKIE,
  consumeBetaPassUse,
  findBetaPass,
  recordBetaPassRedemption,
} from "@/lib/beta-pass";

// The under-development gate's enforcement point (#239).
//
// Runs inside Auth.js's `signIn` callback, which @auth/core invokes BEFORE
// it creates a user row for a first-time OAuth sign-in (handleAuthorized
// precedes handleLoginOrRegister in lib/actions/callback/index.js). That is
// the one place a sign-UP can be told apart from a sign-IN without leaving a
// stray account behind: the proxy cannot do it, because until the provider
// answers nobody knows whether the address is new.
//
// What gets through when FLATPARE_PUBLIC_ACCESS=closed:
//   1. an existing account — the gate is about creation, never access;
//   2. a pending, unexpired invitation for the address — someone already in
//      has vouched for them, which is the same act as handing out a pass;
//   3. a usable beta pass in the cookie /beta/<code> set.
// Everything else answers "closed", and the callback turns that into a
// redirect back to the landing page with an explanation.
//
// A pass is consumed whenever it admits a NEW account, open or closed — the
// use count and the redemption row are what #240 keys the free credits on,
// so they have to be honest regardless of whether the door happened to be
// locked at the time. The pass is only *required* when closed.

export const SIGN_IN_CLOSED_REDIRECT = "/?signin=closed";

export type SignUpDecision = "allowed" | "closed";

async function readBetaPassCookie(): Promise<string> {
  try {
    const store = await cookies();
    return store.get(BETA_PASS_COOKIE)?.value ?? "";
  } catch {
    // Outside a request scope (a unit test driving the callback directly)
    // there is no cookie jar. Treat it as "no pass", never as "let them in".
    return "";
  }
}

async function userExists(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows.length > 0;
}

async function hasPendingInvitation(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email.trim().toLowerCase()),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function decideSignUp(
  user: { email?: string | null }
): Promise<SignUpDecision> {
  const email = user.email ?? null;
  // No address means no way to tell a returning account from a new one.
  // Only a provider misconfiguration produces it; do not let it be a door.
  if (email !== null && (await userExists(email))) return "allowed";

  const code = await readBetaPassCookie();
  const pass = code ? await consumeBetaPassUse(code) : null;
  if (pass) return "allowed";

  if (readPublicAccess() === "open") return "allowed";
  if (email !== null && (await hasPendingInvitation(email))) return "allowed";
  return "closed";
}

// Auth.js's `events.createUser`, fired once the row exists. Ties the new
// account to the pass that admitted it — if there was one — so #240 can
// grant the credits the pass promised. Idempotent: the pass was consumed
// above, and the redemption insert ignores a duplicate user.
export async function recordSignUpPass(user: { id?: string | null }): Promise<void> {
  if (!user.id) return;
  const code = await readBetaPassCookie();
  if (!code) return;
  const pass = await findBetaPass(code);
  if (!pass) return;
  await recordBetaPassRedemption(pass.id, user.id);
}
