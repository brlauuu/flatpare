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
import { eq } from "drizzle-orm";

const hasOAuth = !!(
  process.env.GOOGLE_CLIENT_ID || process.env.GITHUB_CLIENT_ID
);

// Self-hosters get a password path so `docker compose up` works with no
// third-party setup. When OAuth is configured the credentials provider is
// not registered at all — it must not be a back door on the hosted tier.
const providers = [
  ...(process.env.GOOGLE_CLIENT_ID ? [Google] : []),
  ...(process.env.GITHUB_CLIENT_ID ? [GitHub] : []),
  ...(hasOAuth
    ? []
    : [
        Credentials({
          name: "Shared password",
          credentials: { password: { label: "Password", type: "password" } },
          async authorize(creds) {
            const password = String(creds?.password ?? "");
            if (!verifyPassword(password)) return null;

            const email = "self-hosted@flatpare.local";
            const existing = await db
              .select()
              .from(users)
              .where(eq(users.email, email))
              .limit(1);
            if (existing.length > 0) return existing[0];

            const [created] = await db
              .insert(users)
              .values({ email, name: "Self-hosted" })
              .returning();
            return created;
          },
        }),
      ]),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
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
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        const householdId = await resolveHouseholdForUser(user.id);
        token.householdId = householdId;
        token.role = await assertMembership(householdId, user.id);
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.householdId = token.householdId as number;
      session.role = token.role as "owner" | "member";
      return session;
    },
  },
});
