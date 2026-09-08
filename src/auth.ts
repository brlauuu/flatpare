import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/lib/db/schema-auth";
import { verifyPassword } from "@/lib/auth";
import { resolveHouseholdForUser, assertMembership } from "@/lib/household";
import { isUniqueConstraintError } from "@/lib/unique-constraint";
import { eq } from "drizzle-orm";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

const hasOAuth = !!(
  process.env.GOOGLE_CLIENT_ID || process.env.GITHUB_CLIENT_ID
);

// The login page (src/app/page.tsx) needs to know which providers to render
// buttons for, without reading env vars itself in client-shipped code. This
// is computed with the same rule as `providers` below, so the two can never
// drift apart: keep them next to each other.
export const enabledProviderIds: Array<"google" | "github" | "credentials"> = [
  ...(process.env.GOOGLE_CLIENT_ID ? (["google"] as const) : []),
  ...(process.env.GITHUB_CLIENT_ID ? (["github"] as const) : []),
  ...(hasOAuth ? [] : (["credentials"] as const)),
];

const SELF_HOSTED_EMAIL = "self-hosted@flatpare.local";

async function selectSelfHostedUser() {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, SELF_HOSTED_EMAIL))
    .limit(1);
  return rows[0] ?? null;
}

// Exported for tests: the race it closes cannot be reproduced through the
// Credentials provider without standing up Auth.js.
export async function findOrCreateSelfHostedUser() {
  const existing = await selectSelfHostedUser();
  if (existing) return existing;

  try {
    const [created] = await db
      .insert(users)
      .values({ email: SELF_HOSTED_EMAIL, name: "Self-hosted" })
      .returning();
    return created;
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    // Someone else inserted the row between our select and our insert.
    // Their row is the account; return it rather than failing the sign-in.
    const winner = await selectSelfHostedUser();
    if (winner) return winner;
    throw err;
  }
}

// Self-hosters get a password path so `docker compose up` works with no
// third-party setup. When OAuth is configured the credentials provider is
// not registered at all — it must not be a back door on the hosted tier.
//
// Credentials are passed explicitly (not the bare `Google`/`GitHub` provider
// functions) on purpose: left bare, @auth/core's setEnvDefaults() reads
// AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET (and the GitHub equivalents) — a
// different pair of names than GOOGLE_CLIENT_ID, the var that gates
// registration above. That split would mean the variable that turns the
// provider on and the variable that supplies its credential could drift
// apart — a deployer who sets only GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (as
// this repo's own docs instruct) would register a Google provider with no
// client id, and, since hasOAuth is now true, no credentials fallback either.
// Passing clientId/clientSecret explicitly from the *same* env vars that
// gate registration makes that impossible by construction.
// Exported (not just used below) so tests can assert the actual clientId
// each provider was constructed with, rather than only that a provider
// with a given id was registered — the latter would pass even if the
// clientId were silently missing, which is exactly the bug this guards.
export const providers = [
  ...(process.env.GOOGLE_CLIENT_ID
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : []),
  ...(process.env.GITHUB_CLIENT_ID
    ? [
        GitHub({
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }),
      ]
    : []),
  ...(hasOAuth
    ? []
    : [
        Credentials({
          name: "Shared password",
          credentials: { password: { label: "Password", type: "password" } },
          // Every self-hoster shares one account, so two people typing the
          // password at the same time both reach this path. A plain
          // select-then-insert raced two `users` rows onto the same address,
          // each resolving to its own household — a permanent split with no
          // merge UI (#200). The unique index on `users.email` (migration
          // 0015) is what makes the race lose loudly instead of silently;
          // this handler turns that loss into the row the winner inserted.
          async authorize(creds) {
            const password = String(creds?.password ?? "");
            if (!verifyPassword(password)) return null;
            return findOrCreateSelfHostedUser();
          },
        }),
      ]),
];

// Exported so the callbacks can be unit-tested against the real database
// without standing up Auth.js. The jwt callback re-resolves the household
// (a) at sign-in, (b) on every request while the token has none — the user
// is on /invitations deciding — and (c) when a route handler calls
// `unstable_update({})` after changing membership. Otherwise the claims are
// left alone for the token's 24h life (see AGENTS.md, session staleness).
export const authCallbacks = {
  async jwt({
    token,
    user,
    trigger,
  }: {
    token: JWT;
    user?: { id?: string | null } | null;
    trigger?: "signIn" | "signUp" | "update";
  }): Promise<JWT> {
    if (user?.id) {
      token.userId = user.id;
      token.householdId = null;
      token.role = null;
    }
    const userId = token.userId as string | undefined;
    if (userId && (!token.householdId || trigger === "update")) {
      const householdId = await resolveHouseholdForUser(userId);
      if (householdId === null) {
        token.householdId = null;
        token.role = null;
      } else {
        token.householdId = householdId;
        token.role = await assertMembership(householdId, userId);
      }
    }
    return token;
  },
  async session({
    session,
    token,
  }: {
    session: Session;
    token: JWT;
  }): Promise<Session> {
    session.user.id = token.userId as string;
    session.householdId = (token.householdId as number | null) ?? null;
    session.role = (token.role as "owner" | "member" | null) ?? null;
    return session;
  },
};

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: {
    strategy: "jwt",
    // 24h, not the 30d default: a removed member keeps read access until
    // their token expires, so the window is deliberately short.
    maxAge: 60 * 60 * 24,
  },
  callbacks: authCallbacks,
});
