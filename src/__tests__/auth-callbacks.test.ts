import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";

// A pass-through spy on the gate: every test below still runs the real
// decision, and one of them checks what the callback asked for.
const decideSignUpSpy = vi.fn();
vi.mock("@/lib/sign-up-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sign-up-gate")>();
  return {
    ...actual,
    decideSignUp: (...args: Parameters<typeof actual.decideSignUp>) => {
      decideSignUpSpy(...args);
      return actual.decideSignUp(...args);
    },
  };
});

import { households, householdMembers, invitations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import { authCallbacks } from "@/auth";

beforeEach(async () => {
  await db.delete(invitations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "u1", email: "u1@example.com" });
});

describe("jwt callback", () => {
  it("stamps userId, householdId and role at sign-in", async () => {
    const token = await authCallbacks.jwt({
      token: {},
      user: { id: "u1" },
      trigger: "signIn",
    });
    expect(token.userId).toBe("u1");
    expect(typeof token.householdId).toBe("number");
    expect(token.role).toBe("owner");
  });

  it("leaves householdId null while an invitation is pending", async () => {
    await db.insert(users).values({ id: "o", email: "o@example.com" });
    const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
    await db.insert(householdMembers).values({ householdId: h.id, userId: "o", role: "owner" });
    await db.insert(invitations).values({
      householdId: h.id,
      email: "u1@example.com",
      invitedBy: "o",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const token = await authCallbacks.jwt({ token: {}, user: { id: "u1" }, trigger: "signIn" });
    expect(token.householdId).toBeNull();
    expect(token.role).toBeNull();

    // A later request with no household re-resolves; still nothing.
    const again = await authCallbacks.jwt({ token, user: undefined });
    expect(again.householdId).toBeNull();

    // After accepting (membership row appears), the next request picks it up.
    await db.insert(householdMembers).values({ householdId: h.id, userId: "u1", role: "member" });
    const joined = await authCallbacks.jwt({ token: again, user: undefined });
    expect(joined.householdId).toBe(h.id);
    expect(joined.role).toBe("member");
  });

  it("re-resolves on trigger=update even when the token already has a household", async () => {
    const token = await authCallbacks.jwt({ token: {}, user: { id: "u1" }, trigger: "signIn" });
    const original = token.householdId as number;

    // Move the user to a new household directly in the DB.
    await db.delete(householdMembers);
    const [h2] = await db.insert(households).values({ name: "H2", ownerId: "u1" }).returning();
    await db.insert(householdMembers).values({ householdId: h2.id, userId: "u1", role: "member" });

    const unchanged = await authCallbacks.jwt({ token, user: undefined });
    expect(unchanged.householdId).toBe(original);

    const refreshed = await authCallbacks.jwt({ token, user: undefined, trigger: "update" });
    expect(refreshed.householdId).toBe(h2.id);
    expect(refreshed.role).toBe("member");
  });

  it("gives a removed member a fresh household on trigger=update", async () => {
    const token = await authCallbacks.jwt({ token: {}, user: { id: "u1" }, trigger: "signIn" });
    const original = token.householdId as number;
    expect(typeof original).toBe("number");

    // The member is removed from the household they had (E1's remove-member
    // route deletes exactly this row) and no invitation is waiting for them.
    await db
      .delete(householdMembers)
      .where(eq(householdMembers.userId, "u1"));

    const refreshed = await authCallbacks.jwt({ token, user: undefined, trigger: "update" });
    expect(refreshed.householdId).not.toBeNull();
    expect(refreshed.householdId).not.toBe(original);
    expect(refreshed.role).toBe("owner");
  });
});

describe("session callback", () => {
  it("copies nullable claims onto the session", async () => {
    const session = await authCallbacks.session({
      session: { user: { id: "", name: null, email: null, image: null }, householdId: null, role: null, expires: "" },
      token: { userId: "u1", householdId: null, role: null },
    });
    expect(session.user.id).toBe("u1");
    expect(session.householdId).toBeNull();
    expect(session.role).toBeNull();

    const full = await authCallbacks.session({
      session: { user: { id: "", name: null, email: null, image: null }, householdId: null, role: null, expires: "" },
      token: { userId: "u1", householdId: 7, role: "owner" },
    });
    expect(full.householdId).toBe(7);
    expect(full.role).toBe("owner");
  });
});

// The under-development gate (#239) is wired as Auth.js's signIn callback.
// The decision itself is tested in src/lib/__tests__/sign-up-gate.test.ts;
// this checks the two things the wiring adds: `true` lets the sign-in
// proceed, and a refusal is a redirect string (Auth.js then sends the browser
// there instead of to its generic AccessDenied page).
describe("signIn callback", () => {
  const ORIGINAL_ACCESS = process.env.FLATPARE_PUBLIC_ACCESS;
  afterEach(() => {
    if (ORIGINAL_ACCESS === undefined) delete process.env.FLATPARE_PUBLIC_ACCESS;
    else process.env.FLATPARE_PUBLIC_ACCESS = ORIGINAL_ACCESS;
  });

  it("returns true when access is open", async () => {
    delete process.env.FLATPARE_PUBLIC_ACCESS;
    expect(await authCallbacks.signIn({ user: { email: "new@example.com" } })).toBe(true);
  });

  it("returns true for an existing account when closed", async () => {
    process.env.FLATPARE_PUBLIC_ACCESS = "closed";
    expect(await authCallbacks.signIn({ user: { email: "u1@example.com" } })).toBe(true);
  });

  it("passes the magic-link pre-send call through as check-only (#310)", async () => {
    // Pinned by shape: the gate's own test proves consume:false spends
    // nothing; this proves the callback asks for it exactly when Auth.js
    // says the link is about to be sent, and not when it is clicked.
    delete process.env.FLATPARE_PUBLIC_ACCESS;
    decideSignUpSpy.mockClear();
    await authCallbacks.signIn({ user: { email: "new@example.com" }, email: { verificationRequest: true } });
    expect(decideSignUpSpy).toHaveBeenLastCalledWith({ email: "new@example.com" }, { consume: false });
    await authCallbacks.signIn({ user: { email: "new@example.com" } });
    expect(decideSignUpSpy).toHaveBeenLastCalledWith({ email: "new@example.com" }, { consume: true });
  });

  it("returns the landing-page redirect for a refused sign-up", async () => {
    process.env.FLATPARE_PUBLIC_ACCESS = "closed";
    expect(await authCallbacks.signIn({ user: { email: "new@example.com" } })).toBe(
      "/?signin=closed"
    );
  });
});
