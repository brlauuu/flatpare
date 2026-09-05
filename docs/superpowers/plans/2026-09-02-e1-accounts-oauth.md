# E1 — Accounts, OAuth, and multi-tenancy: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared-password gate with real per-user accounts, and scope every row and file in the app to a household.

**Architecture:** Auth.js (next-auth v5) owns identity via Google/GitHub OAuth, with a credentials provider retained for self-hosters. A `households` table plus a `household_members` join table is the tenancy unit; every data table gains `household_id NOT NULL` and every query filters on the session's household. Uploads move under a household-prefixed path so the two file-serving routes can verify ownership.

**Tech Stack:** Next.js 16 App Router, next-auth 5 (beta), @auth/drizzle-adapter, Drizzle ORM, libSQL/Turso, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-e1-accounts-oauth-design.md`

> **Status (2026-09-05): executed and merged as #209.** Kept as the record of
> how E1 was built. Three things differ from the plan text below:
>
> - **`api_usage` is gone.** Task 1 adds a nullable `household_id` to
>   `apiUsage`; instead the whole cost feature — table and recorders — was
>   deleted mid-epic, so nothing in the shipped schema carries that column.
> - **Ratings key on `user_id`, not `user_name`.** Task 5 as written let the
>   old name-keyed ratings survive; review caught that it broke the core
>   feature and the API now left-joins `users` for display names.
> - **Upload scoping (Task 4) took four rounds, not one.** Each fix checked a
>   different string than the one it used; the shipped version canonicalises
>   the pathname once (`src/lib/pathname.ts`) and rejects residual
>   percent-encoding; `docs/security-notes.md` covers the deploy-time footgun
>   that canonicalisation introduced.

The spec sketches five staged commits; this plan uses six, splitting the proxy
session gate out of "Auth.js wiring" so it carries its own test cycle.

## Global Constraints

- The tenancy unit is a **`household`**. `accounts` is Auth.js's OAuth-link table and must not be reused for tenancy.
- Everything ships on **one branch as one PR**. `main` must never contain OAuth sign-in without household scoping — that state is open to any Google user.
- Session strategy is **JWT**, lifetime capped at **24 hours**.
- Reads may trust the JWT. **Destructive and membership-changing operations must re-check membership against the database.**
- `MAX_MEMBERS` / `MAX_APARTMENTS` are **not** part of E1 (that is E5). Do not add limit enforcement here.
- **Invitations are not part of E1** (split to #197). E1 ships households with exactly one member. Do not add an `invitations` table, an invite UI, or member-removal endpoints. `resolveHouseholdForUser` must still prefer an existing membership over creating one — that is the code path invitations will use later.
- The production database is **wiped**; no migration path is written.
- Tests that assert tenant isolation **must run against the real test SQLite database**, never against a mocked `db`. A mocked `db.select()` returns its fixture regardless of the `where` clause, so a mock-based isolation test passes even when scoping is entirely absent. This is the single most important testing rule in this plan.
- Read `node_modules/next/dist/docs/` before using an unfamiliar Next.js API. This repo is Next 16 and differs from older training data.
- Run `npm run lint`, `npm run typecheck`, and `npm test` before every commit.

---

## File Structure

**Created:**
- `src/lib/db/schema-auth.ts` — Auth.js's four tables (users, accounts, sessions, verification_tokens), kept apart from app tables so the adapter's requirements are obvious.
- `src/auth.ts` — Auth.js configuration: providers, adapter, callbacks. Exports `handlers`, `auth`, `signIn`, `signOut`.
- `src/app/api/auth/[...nextauth]/route.ts` — the Auth.js route handler.
- `src/lib/household.ts` — `requireHousehold()` and `assertMembership()`; the single place a route learns whose data it may touch.
- `src/lib/__tests__/household.test.ts`
- `src/lib/db/__tests__/tenancy.test.ts` — real-database isolation tests.

**Modified:**
- `src/lib/db/schema.ts` — households, household_members, `householdId` on four tables.
- `src/proxy.ts` — session gate replaces the cookie check.
- `src/lib/auth.ts` — reduced to `verifyPassword` for the credentials provider.
- `src/lib/storage.ts` — household-prefixed upload paths.
- `src/app/api/pdf/[...path]/route.ts`, `src/app/api/uploads/[...path]/route.ts` — ownership checks.
- 12 data route handlers (listed in Task 5).
- `AGENTS.md`, `docs/security-notes.md`.

**Deleted:**
- `src/lib/auth-cookie.ts`
- `src/app/api/auth/route.ts`, `src/app/api/auth/name/route.ts`, `src/app/api/auth/users/route.ts`, `src/app/api/auth/users/[name]/route.ts`

---

### Task 1: Schema — households, members, and scoping columns

**Files:**
- Create: `src/lib/db/schema-auth.ts`
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/` migration (generated)
- Test: `src/lib/db/__tests__/tenancy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `households`, `householdMembers` tables; `householdId` column on `apartments`, `ratings`, `locationsOfInterest`, `apartmentDistances`; `users`, `accounts`, `sessions`, `verificationTokens` from `schema-auth.ts`. Types `Household`, `HouseholdMember`.

- [ ] **Step 1: Install dependencies**

```bash
npm install next-auth@beta @auth/drizzle-adapter
```

Verify `next-auth` resolves to a `5.0.0-beta.*` version and that npm reports no peer-dependency errors against Next 16:

```bash
npm ls next-auth @auth/drizzle-adapter
```

- [ ] **Step 2: Write the failing tenancy test**

This test uses the real test database. `src/test-global-setup.ts` already points `LOCAL_DB_URL` at `file:./data/test.db` and runs migrations.

Create `src/lib/db/__tests__/tenancy.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  apartments,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";

// Real database, not mocks: a mocked db returns its fixture regardless of
// the where clause, so a mocked isolation test passes even with no scoping.
beforeEach(async () => {
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function seedHousehold(userId: string, name: string) {
  await db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  const [h] = await db
    .insert(households)
    .values({ name, ownerId: userId })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: h.id, userId, role: "owner" });
  return h;
}

describe("household scoping", () => {
  it("keeps apartments in separate households apart", async () => {
    const a = await seedHousehold("user-a", "A");
    const b = await seedHousehold("user-b", "B");

    await db.insert(apartments).values({ name: "A flat", householdId: a.id });
    await db.insert(apartments).values({ name: "B flat", householdId: b.id });

    const forA = await db
      .select()
      .from(apartments)
      .where(eq(apartments.householdId, a.id));

    expect(forA).toHaveLength(1);
    expect(forA[0].name).toBe("A flat");
  });

  it("refuses an apartment with no household", async () => {
    await expect(
      // @ts-expect-error householdId is required — this must fail at runtime too
      db.insert(apartments).values({ name: "orphan" })
    ).rejects.toThrow();
  });

  it("cascades apartments when a household is deleted", async () => {
    const a = await seedHousehold("user-a", "A");
    await db.insert(apartments).values({ name: "A flat", householdId: a.id });

    await db.delete(households).where(eq(households.id, a.id));

    expect(await db.select().from(apartments)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/db/__tests__/tenancy.test.ts`
Expected: FAIL — `households` is not exported from `@/lib/db/schema`.

- [ ] **Step 4: Write the Auth.js tables**

Create `src/lib/db/schema-auth.ts`. These four tables and their column names are dictated by `@auth/drizzle-adapter`; do not rename them.

```ts
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// Owned by @auth/drizzle-adapter. `accounts` here means OAuth provider links,
// NOT the tenancy unit — that is `households` in schema.ts.
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);
```

- [ ] **Step 5: Add households and scoping columns**

In `src/lib/db/schema.ts`, add the import and the two new tables at the top of the file (after the existing imports):

```ts
import { users } from "./schema-auth";

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Read by E5/E6. Present now so the column does not need adding later.
  tier: text("tier").notNull().default("free"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.userId] })]
);

export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;
```

Then add this column to **each** of `apartments`, `ratings`, `locationsOfInterest`, and `apartmentDistances`:

```ts
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
```

And add a nullable one to `apiUsage` (host telemetry, attributed per household under E6, never served through a scoped route):

```ts
  householdId: integer("household_id").references(() => households.id, {
    onDelete: "set null",
  }),
```

- [ ] **Step 6: Replace the user identity on ratings**

In `ratings`, delete the `userName` column and its unique index, and replace them with:

```ts
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
```

```ts
    uniqueIndex("ratings_apartment_user_idx").on(
      table.apartmentId,
      table.userId
    ),
```

Delete the old `users` table declaration from `schema.ts` entirely — Auth.js's `users` in `schema-auth.ts` replaces it. Re-export it so existing imports of `@/lib/db/schema` keep resolving:

```ts
export { users, accounts, sessions, verificationTokens } from "./schema-auth";
```

- [ ] **Step 7: Generate the migration**

```bash
npm run db:generate
```

Inspect the generated SQL in `drizzle/`. Because the production database is being wiped and `household_id` is `NOT NULL` with no default, the generated migration may not be applicable to a populated database — that is expected and acceptable per the spec. Confirm the file creates `households`, `household_members`, and the four Auth.js tables.

- [ ] **Step 8: Run the test to verify it passes**

```bash
rm -f data/test.db && npx vitest run src/lib/db/__tests__/tenancy.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 9: Run the full suite**

```bash
npm test
```

Expected: **failures** in tests that reference `ratings.userName` or the old `users.name`. Note which files fail; Task 5 fixes them. Do not fix them here.

- [ ] **Step 10: Commit**

```bash
git add src/lib/db/ drizzle/ package.json package-lock.json
git commit -m "feat(db): households, household members, and per-row scoping

Adds the tenancy tables and household_id on every data table, plus the
four tables @auth/drizzle-adapter requires. Auth.js's `accounts` means
OAuth links; the tenancy unit is `households`.

Ratings key off users.id instead of a display-name string.

Isolation is tested against the real test database, not mocks: a mocked
db returns its fixture regardless of the where clause, so a mocked
isolation test passes even with no scoping at all."
```

---

### Task 2: Auth.js configuration and household resolution

**Files:**
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/household.ts`
- Test: `src/lib/__tests__/household.test.ts`

**Interfaces:**
- Consumes: `households`, `householdMembers` (Task 1).
- Produces:
  - `src/auth.ts`: `handlers`, `auth`, `signIn`, `signOut`.
  - `src/lib/household.ts`:
    - `requireHousehold(): Promise<{ householdId: number; userId: string; role: "owner" | "member" }>` — throws `UnauthorizedError` when there is no session.
    - `assertMembership(householdId: number, userId: string): Promise<"owner" | "member">` — reads the database; throws `ForbiddenError` when the user is not a member.
    - `class UnauthorizedError extends Error`, `class ForbiddenError extends Error`.
    - `resolveHouseholdForUser(userId: string): Promise<number>` — returns the user's household id, creating one on first sign-in.

- [ ] **Step 1: Write the failing household-resolution test**

Create `src/lib/__tests__/household.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import {
  resolveHouseholdForUser,
  assertMembership,
  ForbiddenError,
} from "../household";

beforeEach(async () => {
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeUser(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.com` });
}

describe("resolveHouseholdForUser", () => {
  it("creates a household and makes the first user its owner", async () => {
    await makeUser("u1");
    const id = await resolveHouseholdForUser("u1");

    const [h] = await db.select().from(households).where(eq(households.id, id));
    expect(h.ownerId).toBe("u1");

    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, id));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });

  it("reuses the household on a second sign-in", async () => {
    await makeUser("u1");
    const first = await resolveHouseholdForUser("u1");
    const second = await resolveHouseholdForUser("u1");
    expect(second).toBe(first);
    expect(await db.select().from(households)).toHaveLength(1);
  });

  it("does not create a second household for an invited member", async () => {
    await makeUser("owner");
    await makeUser("invitee");
    const id = await resolveHouseholdForUser("owner");
    await db
      .insert(householdMembers)
      .values({ householdId: id, userId: "invitee", role: "member" });

    expect(await resolveHouseholdForUser("invitee")).toBe(id);
    expect(await db.select().from(households)).toHaveLength(1);
  });
});

describe("assertMembership", () => {
  it("returns the role for a member", async () => {
    await makeUser("u1");
    const id = await resolveHouseholdForUser("u1");
    expect(await assertMembership(id, "u1")).toBe("owner");
  });

  it("throws for a non-member — this is the cross-tenant guard", async () => {
    await makeUser("u1");
    await makeUser("outsider");
    const id = await resolveHouseholdForUser("u1");
    await expect(assertMembership(id, "outsider")).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/household.test.ts`
Expected: FAIL — cannot resolve `../household`.

- [ ] **Step 3: Write `src/lib/household.ts`**

```ts
import { db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Not a member of this household");
  }
}

export type Role = "owner" | "member";

export async function resolveHouseholdForUser(
  userId: string
): Promise<number> {
  const existing = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0].householdId;

  const [created] = await db
    .insert(households)
    .values({ name: "My household", ownerId: userId })
    .returning();

  await db
    .insert(householdMembers)
    .values({ householdId: created.id, userId, role: "owner" });

  return created.id;
}

// Reads the database rather than trusting the JWT. Call this from every
// destructive or membership-changing operation: a JWT stays valid for up to
// its 24h lifetime, so a removed member's token still carries a householdId.
export async function assertMembership(
  householdId: number,
  userId: string
): Promise<Role> {
  const rows = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId)
      )
    )
    .limit(1);

  if (rows.length === 0) throw new ForbiddenError();
  return rows[0].role as Role;
}

export async function requireHousehold(): Promise<{
  householdId: number;
  userId: string;
  role: Role;
}> {
  const session = await auth();
  const userId = session?.user?.id;
  const householdId = session?.householdId;
  const role = session?.role;

  if (!userId || !householdId || !role) throw new UnauthorizedError();

  return { householdId, userId, role };
}
```

- [ ] **Step 4: Write the Auth.js config**

Create `src/auth.ts`:

```ts
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
        token.householdId = await resolveHouseholdForUser(user.id);
        token.role = await assertMembership(token.householdId, user.id);
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
```

- [ ] **Step 5: Declare the session type augmentation**

Create `src/types/next-auth.d.ts`:

```ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    householdId: number;
    role: "owner" | "member";
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

- [ ] **Step 6: Add the route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/__tests__/household.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck && npm run lint
git add src/auth.ts src/lib/household.ts src/types/ "src/app/api/auth/[...nextauth]/" src/lib/__tests__/household.test.ts
git commit -m "feat(auth): Auth.js providers, adapter, and household resolution

OAuth when GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID are set; a credentials
provider using APP_PASSWORD otherwise, so self-hosting needs no
third-party setup. The credentials provider is not registered when OAuth
is present — it must not be a back door on the hosted tier.

JWT sessions capped at 24h. assertMembership() reads the database rather
than trusting the token, because a removed member's JWT still carries a
householdId until it expires."
```

---

### Task 3: Proxy becomes a session gate

**Files:**
- Modify: `src/proxy.ts`
- Test: `src/__tests__/proxy.test.ts`

**Interfaces:**
- Consumes: `auth` from `src/auth.ts`.
- Produces: a proxy that redirects unauthenticated page requests to `/`, returns JSON 401 for `/api/*`, and leaves `/api/auth/*` and the PWA assets public.

- [ ] **Step 1: Rewrite the proxy tests for sessions**

The existing tests construct cookie headers by hand. Replace the auth-cookie describes with session-based ones. Keep the "PWA assets stay public" describe exactly as it is — it still applies.

In `src/__tests__/proxy.test.ts`, replace `authedCookies()` and the forged-cookie describe with:

```ts
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
const mockedAuth = vi.mocked(auth);

function signedIn() {
  mockedAuth.mockResolvedValue({
    user: { id: "u1" },
    householdId: 1,
    role: "owner",
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as never);
}

function signedOut() {
  mockedAuth.mockResolvedValue(null as never);
}
```

Then assert:

```ts
describe("proxy — session gate", () => {
  it("redirects an unauthenticated page request to the login screen", async () => {
    signedOut();
    const res = await proxy(makeRequest("/apartments"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/$/);
  });

  it("returns JSON 401 for an unauthenticated API request", async () => {
    signedOut();
    const res = await proxy(makeRequest("/api/apartments"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("lets a signed-in user through", async () => {
    signedIn();
    const res = await proxy(makeRequest("/apartments"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("always allows the Auth.js endpoints", async () => {
    signedOut();
    const res = await proxy(makeRequest("/api/auth/signin"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/proxy.test.ts`
Expected: FAIL — `proxy` is synchronous and reads cookies.

- [ ] **Step 3: Rewrite the proxy**

Replace the body of `src/proxy.ts` with:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Auth.js owns its own endpoints; gating them breaks the sign-in flow.
  if (path.startsWith("/api/auth/")) return NextResponse.next();

  const session = await auth();
  const isAuthed = !!session?.user?.id && !!session.householdId;

  if (path === "/") {
    if (isAuthed) return NextResponse.redirect(new URL("/apartments", request.url));
    return NextResponse.next();
  }

  if (!isAuthed) {
    return path.startsWith("/api/")
      ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      : NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // The PWA manifest and its icons must stay public: a browser fetches the
    // manifest WITHOUT credentials, so gating it makes the app silently
    // uninstallable. None of these files contain user data.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/proxy.test.ts`
Expected: PASS, including the unchanged PWA-matcher tests.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/__tests__/proxy.test.ts
git commit -m "feat(auth): proxy authorizes from the Auth.js session

Replaces the HMAC cookie check. /api/auth/* stays public for the sign-in
flow and the PWA assets stay outside the matcher."
```

---

### Task 4: Storage path scoping — the IDOR fix

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/app/api/pdf/[...path]/route.ts`
- Modify: `src/app/api/uploads/[...path]/route.ts`
- Test: `src/lib/__tests__/storage-scoping.test.ts`

**Interfaces:**
- Consumes: `requireHousehold` (Task 2).
- Produces: `uploadFile(householdId: number, filename: string, file: File): Promise<string>`; `householdIdFromStoredPath(pathname: string): number | null`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/storage-scoping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { householdIdFromStoredPath } from "../storage";

describe("householdIdFromStoredPath", () => {
  it("reads the household prefix", () => {
    expect(householdIdFromStoredPath("households/7/abc.pdf")).toBe(7);
  });

  it("rejects a path with no household prefix", () => {
    expect(householdIdFromStoredPath("apartments/abc.pdf")).toBeNull();
  });

  it("rejects traversal attempts", () => {
    expect(householdIdFromStoredPath("households/7/../8/secret.pdf")).toBeNull();
    expect(householdIdFromStoredPath("../households/8/secret.pdf")).toBeNull();
  });

  it("rejects a non-numeric household segment", () => {
    expect(householdIdFromStoredPath("households/abc/x.pdf")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/storage-scoping.test.ts`
Expected: FAIL — `householdIdFromStoredPath` is not exported.

- [ ] **Step 3: Implement in `src/lib/storage.ts`**

Add:

```ts
// Stored paths are `households/<id>/<filename>`. The two file-serving routes
// compare this id against the session's household — without it, any member
// could read another household's listing PDFs by guessing a path.
export function householdIdFromStoredPath(pathname: string): number | null {
  if (pathname.includes("..")) return null;
  const segments = pathname.split("/");
  if (segments.length < 3) return null;
  if (segments[0] !== "households") return null;
  if (!/^\d+$/.test(segments[1])) return null;
  return Number(segments[1]);
}
```

Change `uploadFile` to take the household id and use the prefix:

```ts
export async function uploadFile(
  householdId: number,
  filename: string,
  file: File
): Promise<string> {
  const key = `households/${householdId}/${filename}`;

  if (isCloud) {
    const blob = await put(key, file, { access: "private" });
    return `/api/pdf/${blob.pathname}`;
  }

  const dir = path.join(UPLOADS_DIR, "households", String(householdId));
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/api/uploads/${key}`;
}
```

Update `readStoredFile` so the local branch resolves the same prefixed path, and assert the resolved path stays inside `UPLOADS_DIR`:

```ts
  if (storedUrl.startsWith("/api/uploads/")) {
    const rel = decodeURIComponent(storedUrl.slice("/api/uploads/".length));
    if (householdIdFromStoredPath(rel) === null) {
      throw new Error("Refusing to read an unscoped upload path");
    }
    const resolved = path.resolve(UPLOADS_DIR, rel);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      throw new Error("Path escapes the uploads directory");
    }
    return readFile(resolved);
  }
```

- [ ] **Step 4: Guard both serving routes**

In `src/app/api/pdf/[...path]/route.ts`, replace the `isAuthenticated` check with:

```ts
import { requireHousehold } from "@/lib/household";
import { householdIdFromStoredPath } from "@/lib/storage";
```

```ts
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { path: segments } = await params;
  const pathname = segments.join("/");

  const owner = householdIdFromStoredPath(pathname);
  if (owner === null || owner !== householdId) {
    // 404, not 403: a 403 confirms the file exists in someone else's household.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
```

Apply the identical guard in `src/app/api/uploads/[...path]/route.ts`.

- [ ] **Step 5: Add route-level tests**

Append to `src/lib/__tests__/storage-scoping.test.ts`:

```ts
import { GET as pdfGet } from "@/app/api/pdf/[...path]/route";

vi.mock("@/lib/household", () => ({
  requireHousehold: vi.fn(async () => ({
    householdId: 1,
    userId: "u1",
    role: "owner" as const,
  })),
}));

describe("GET /api/pdf/[...path] — cross-household", () => {
  it("404s a file belonging to another household", async () => {
    const res = await pdfGet(new Request("http://localhost/api/pdf/x"), {
      params: Promise.resolve({ path: ["households", "2", "secret.pdf"] }),
    });
    expect(res.status).toBe(404);
  });

  it("404s a traversal attempt", async () => {
    const res = await pdfGet(new Request("http://localhost/api/pdf/x"), {
      params: Promise.resolve({ path: ["households", "1", "..", "2", "s.pdf"] }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run and commit**

```bash
npx vitest run src/lib/__tests__/storage-scoping.test.ts
npm run typecheck
git add src/lib/storage.ts "src/app/api/pdf/" "src/app/api/uploads/" src/lib/__tests__/storage-scoping.test.ts
git commit -m "fix(security): scope stored files to a household

The two file-serving routes served any path to any authenticated caller.
With one shared pool that was safe; with households it is a cross-tenant
read. Uploads now live under households/<id>/ and both routes verify the
prefix against the session, answering 404 rather than 403 so the reply
does not confirm the file exists elsewhere."
```

---

### Task 5: Scope every data route

**Files (all Modify):**
- `src/app/api/apartments/route.ts`
- `src/app/api/apartments/[id]/route.ts`
- `src/app/api/apartments/[id]/ratings/route.ts`
- `src/app/api/apartments/[id]/reprocess/route.ts`
- `src/app/api/apartments/check-listings/route.ts`
- `src/app/api/locations/route.ts`
- `src/app/api/locations/[id]/route.ts`
- `src/app/api/locations/[id]/move/route.ts`
- `src/app/api/geocode/backfill/route.ts`
- `src/app/api/settings/recompute-distances/route.ts`
- `src/app/api/parse-pdf/route.ts`
- `src/app/api/parse-pdf/upload-token/route.ts`
- Test: `src/app/api/__tests__/cross-tenant.test.ts`

**Interfaces:**
- Consumes: `requireHousehold`, `assertMembership` (Task 2); `uploadFile(householdId, …)` (Task 4).
- Produces: no new exports. Every handler above filters by `householdId`.

- [ ] **Step 1: Write the cross-tenant test against the real database**

This is the test that proves the epic. Create `src/app/api/__tests__/cross-tenant.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { apartments, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

const currentSession = { householdId: 0, userId: "", role: "owner" as const };

vi.mock("@/lib/household", async () => {
  const actual = await vi.importActual<typeof import("@/lib/household")>(
    "@/lib/household"
  );
  return {
    ...actual,
    requireHousehold: vi.fn(async () => ({ ...currentSession })),
  };
});

import { GET as apartmentsGet } from "../apartments/route";
import { DELETE as apartmentDelete } from "../apartments/[id]/route";

let houseA = 0;
let houseB = 0;
let flatB = 0;

beforeEach(async () => {
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);

  await db.insert(users).values([
    { id: "ua", email: "a@example.com" },
    { id: "ub", email: "b@example.com" },
  ]);
  const [a] = await db
    .insert(households)
    .values({ name: "A", ownerId: "ua" })
    .returning();
  const [b] = await db
    .insert(households)
    .values({ name: "B", ownerId: "ub" })
    .returning();
  houseA = a.id;
  houseB = b.id;
  await db.insert(householdMembers).values([
    { householdId: houseA, userId: "ua", role: "owner" },
    { householdId: houseB, userId: "ub", role: "owner" },
  ]);

  await db.insert(apartments).values({ name: "A flat", householdId: houseA });
  const [fb] = await db
    .insert(apartments)
    .values({ name: "B flat", householdId: houseB })
    .returning();
  flatB = fb.id;

  currentSession.householdId = houseA;
  currentSession.userId = "ua";
});

describe("cross-household isolation", () => {
  it("GET /api/apartments returns only the caller's household", async () => {
    const res = await apartmentsGet();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("A flat");
  });

  it("DELETE /api/apartments/[id] cannot delete another household's flat", async () => {
    const res = await apartmentDelete(
      new Request(`http://localhost/api/apartments/${flatB}`),
      { params: Promise.resolve({ id: String(flatB) }) }
    );
    expect(res.status).toBe(404);
    expect(await db.select().from(apartments)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/api/__tests__/cross-tenant.test.ts`
Expected: FAIL — `GET` returns both flats, and the delete succeeds.

- [ ] **Step 3: Apply this exact transformation to each of the 12 route files**

Replace the auth preamble:

```ts
// before
import { getDisplayName, isAuthenticated, unauthorized } from "@/lib/auth";
if (!(await isAuthenticated())) return unauthorized();

// after
import { requireHousehold, UnauthorizedError } from "@/lib/household";

let householdId: number;
let userId: string;
try {
  ({ householdId, userId } = await requireHousehold());
} catch (e) {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  throw e;
}
```

Then, in every query in that file:

- `SELECT`: add `eq(apartments.householdId, householdId)` to the `where`, combining with `and(...)` when a condition already exists.
- `INSERT`: add `householdId` to the values.
- `UPDATE` / `DELETE`: add the same `householdId` predicate to the `where`. A row that does not match must answer **404**, not 403.
- Anywhere `getDisplayName()` supplied `ratings.userName`, use `userId` and `ratings.userId`.
- In `src/app/api/parse-pdf/route.ts`, pass the household to storage: `uploadFile(householdId, filename, file)`.

**Destructive handlers additionally re-check the database.** The JWT carries a
`householdId` that stays valid for up to 24 hours, so a removed member's token
still names their old household. Reads may trust it; deletes must not. In the
`DELETE` and `PATCH` handlers of `apartments/[id]` and `locations/[id]`, and in
`locations/[id]/move`, add after resolving the session:

```ts
import { assertMembership, ForbiddenError } from "@/lib/household";

try {
  await assertMembership(householdId, userId);
} catch (e) {
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  throw e;
}
```

Add a test for this in `cross-tenant.test.ts`: seed a member, delete their
`household_members` row, keep the session fixture pointing at the old
household, and assert the delete answers 404 and changes nothing.

- [ ] **Step 4: Run the cross-tenant test to verify it passes**

Run: `npx vitest run src/app/api/__tests__/cross-tenant.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Extend the cross-tenant test to the remaining routes**

Add one `it` per remaining handler, following the two patterns above: a list endpoint must return only the caller's rows, and a by-id mutation against another household's row must answer 404 and leave the database unchanged. Cover: `apartments/[id]` GET and PATCH, `apartments/[id]/ratings` GET and POST, `apartments/[id]/reprocess` POST, `locations` GET and POST, `locations/[id]` PATCH and DELETE, `locations/[id]/move` POST, `geocode/backfill` POST, `settings/recompute-distances` POST, `apartments/check-listings` POST.

- [ ] **Step 6: Fix the tests broken in Task 1**

The mock-based suites that referenced `ratings.userName` and the old `users.name` now fail. Update their schema mocks to `userId`, and their auth mocks from `@/lib/auth` to `@/lib/household`. Do not convert them to real-database tests; their job is handler logic, and the isolation guarantee is covered by `cross-tenant.test.ts`.

- [ ] **Step 7: Run everything and commit**

```bash
npm run lint && npm run typecheck && npm test
git add src/app/api/ 
git commit -m "feat(api): scope every data route to the caller's household

All 12 data handlers resolve the household from the session and filter
every read, write, and delete on it. A by-id operation against another
household's row answers 404 rather than 403, so the response does not
confirm the row exists.

Isolation is proven against the real test database. The pre-existing
handler tests mock db entirely, which cannot prove scoping: a mocked
select returns its fixture no matter what the where clause says."
```

---

### Task 6: Remove the shared-password model and update the docs

**Files:**
- Delete: `src/lib/auth-cookie.ts`, `src/app/api/auth/route.ts`, `src/app/api/auth/name/route.ts`, `src/app/api/auth/users/route.ts`, `src/app/api/auth/users/[name]/route.ts`
- Modify: `src/lib/auth.ts`, `src/app/page.tsx`, `src/components/nav-bar.tsx`, the five `layout.tsx` files that read the display name, `AGENTS.md`, `docs/security-notes.md`
- Delete: `src/lib/__tests__/auth.test.ts` sections covering the removed helpers

**Interfaces:**
- Consumes: `signIn`, `signOut` from `src/auth.ts`.
- Produces: `src/lib/auth.ts` exporting only `verifyPassword`.

- [ ] **Step 1: Reduce `src/lib/auth.ts`**

Delete `unauthorized`, `isAuthenticated`, `setAuthenticated`, `getDisplayName`, `setDisplayName`, and every import of `next/headers` and `auth-cookie`. Keep only `verifyPassword`, unchanged — the credentials provider still uses it, and its constant-time comparison is still wanted.

- [ ] **Step 2: Delete the old auth routes and cookie module**

```bash
git rm src/lib/auth-cookie.ts src/app/api/auth/route.ts src/app/api/auth/name/route.ts src/app/api/auth/users/route.ts
git rm -r "src/app/api/auth/users"
```

- [ ] **Step 3: Rewrite the login page**

`src/app/page.tsx` becomes a sign-in screen: a Google button, a GitHub button, and a password form, each rendered only when its provider is configured. Fetch the provider list from Auth.js rather than reading env vars in the client:

```tsx
"use client";
import { signIn } from "next-auth/react";

export default function LoginPage({ providers }: { providers: string[] }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3">
        {providers.includes("google") && (
          <button className="h-11 w-full" onClick={() => signIn("google")}>
            Continue with Google
          </button>
        )}
        {providers.includes("github") && (
          <button className="h-11 w-full" onClick={() => signIn("github")}>
            Continue with GitHub
          </button>
        )}
        {providers.includes("credentials") && (
          <form action={() => signIn("credentials")}>
            <input type="password" name="password" className="h-11 w-full" />
            <button className="h-11 w-full" type="submit">Enter</button>
          </form>
        )}
      </div>
    </div>
  );
}
```

Keep the 44px minimum heights — E0 raised them and this page must not regress.

- [ ] **Step 4: Replace display-name reads**

In `src/components/nav-bar.tsx` and the five layouts, replace `getDisplayName()` with the session user's name, and replace the user-switching dropdown with a sign-out action calling `signOut()`. Delete the "add user" flow: membership now comes from invitations, not from typing a name.

- [ ] **Step 5: Rewrite the docs**

In `AGENTS.md`, replace the entire Auth section. It currently documents `APP_PASSWORD`, the HMAC cookie, `isAuthenticated()`, and the exact-match `/api/auth` allow-list — all of which will be false. Document instead: Auth.js v5, the two provider paths, JWT sessions with the 24h cap, `requireHousehold()` / `assertMembership()`, and the rule that destructive operations re-check the database.

In `docs/security-notes.md`, replace the "Auth model — reviewed 2026-09-01" section with one for this change. State plainly that the HMAC cookie scheme it describes no longer exists, and record the JWT staleness window as an accepted, bounded risk with its mitigations.

- [ ] **Step 6: Full verification**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: all green. Any test still importing a deleted helper must be deleted or rewritten, not skipped.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): remove the shared-password model

Deletes the HMAC cookie, the four hand-rolled auth routes, and the
display-name model. verifyPassword survives for the self-host credentials
provider.

AGENTS.md and docs/security-notes.md are rewritten in the same commit:
both documented a cookie scheme that no longer exists, and stale security
documentation is worse than none."
```

---

## Before opening the pull request

- [ ] Register OAuth callback URLs with Google and GitHub for **both** the production domain and Vercel preview URLs. First sign-in fails in production with no local warning if this is skipped.
- [ ] Set `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` in Vercel.
- [ ] Confirm with the repository owner before wiping the production database. The spec accepts the loss; the timing is still theirs to choose.
- [ ] Verify the self-host path end to end: with no OAuth env set, `docker compose up` must reach a working password login.
