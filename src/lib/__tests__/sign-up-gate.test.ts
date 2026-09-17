import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  betaPasses,
  betaPassRedemptions,
  households,
  householdMembers,
  invitations,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

// The gate reads the beta-pass cookie through next/headers, which only works
// inside a request. Stand in for the jar so each test can say what the
// browser presented.
let cookieJar: Record<string, string> = {};
let cookiesThrow = false;
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (cookiesThrow) throw new Error("cookies() called outside a request scope");
    return {
      get: (name: string) =>
        name in cookieJar ? { name, value: cookieJar[name] } : undefined,
    };
  },
}));

import {
  BETA_PASS_COOKIE,
  createBetaPass,
  findBetaPassRedemption,
  findBetaPass,
} from "@/lib/beta-pass";
import { decideSignUp, recordSignUpPass, SIGN_IN_CLOSED_REDIRECT } from "../sign-up-gate";

const ORIGINAL_ACCESS = process.env.FLATPARE_PUBLIC_ACCESS;

function present(code: string) {
  cookieJar = { [BETA_PASS_COOKIE]: code };
}

async function usesOf(id: number): Promise<number> {
  const rows = await db.select().from(betaPasses);
  return rows.find((r) => r.id === id)!.uses;
}

beforeEach(async () => {
  cookieJar = {};
  cookiesThrow = false;
  await db.delete(betaPassRedemptions);
  await db.delete(betaPasses);
  await db.delete(invitations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "existing", email: "existing@example.com" });
});

afterEach(() => {
  if (ORIGINAL_ACCESS === undefined) delete process.env.FLATPARE_PUBLIC_ACCESS;
  else process.env.FLATPARE_PUBLIC_ACCESS = ORIGINAL_ACCESS;
});

describe("decideSignUp — access open (the default)", () => {
  beforeEach(() => {
    delete process.env.FLATPARE_PUBLIC_ACCESS;
  });

  it("lets a new address in", async () => {
    expect(await decideSignUp({ email: "new@example.com" })).toBe("allowed");
  });

  it("lets an existing account in", async () => {
    expect(await decideSignUp({ email: "existing@example.com" })).toBe("allowed");
  });

  it("lets an address-less provider profile in", async () => {
    expect(await decideSignUp({ email: null })).toBe("allowed");
    expect(await decideSignUp({})).toBe("allowed");
  });

  // Open or closed, a pass that admits a NEW account is spent: #240 keys the
  // free credits on the use count and the redemption, so the record has to
  // be honest regardless of whether the door happened to be locked.
  it("still consumes a presented pass for a new account", async () => {
    const pass = await createBetaPass({ maxUses: 1 });
    present(pass.code);
    expect(await decideSignUp({ email: "new@example.com" })).toBe("allowed");
    expect(await usesOf(pass.id)).toBe(1);
  });

  it("does not consume a pass for an existing account", async () => {
    const pass = await createBetaPass({ maxUses: 1 });
    present(pass.code);
    expect(await decideSignUp({ email: "existing@example.com" })).toBe("allowed");
    expect(await usesOf(pass.id)).toBe(0);
  });
});

describe("decideSignUp — access closed", () => {
  beforeEach(() => {
    process.env.FLATPARE_PUBLIC_ACCESS = "closed";
  });

  it("refuses a new address with nothing to show", async () => {
    expect(await decideSignUp({ email: "new@example.com" })).toBe("closed");
  });

  // The gate is about creating accounts, never about access: the author and
  // every tester already in must keep signing in.
  it("lets an existing account in", async () => {
    expect(await decideSignUp({ email: "existing@example.com" })).toBe("allowed");
  });

  it("refuses an address-less provider profile, since it cannot be matched to an account", async () => {
    expect(await decideSignUp({ email: null })).toBe("closed");
  });

  it("lets a usable beta pass in and consumes one use", async () => {
    const pass = await createBetaPass({ maxUses: 2 });
    present(pass.code);
    expect(await decideSignUp({ email: "new@example.com" })).toBe("allowed");
    expect(await usesOf(pass.id)).toBe(1);
  });

  it.each([
    ["unknown", async () => "not-a-code"],
    ["revoked", async () => {
      const p = await createBetaPass();
      await db.update(betaPasses).set({ revokedAt: new Date() });
      return p.code;
    }],
    ["expired", async () =>
      (await createBetaPass({ expiresAt: new Date(Date.now() - 1000) })).code],
    ["exhausted", async () =>
      (await createBetaPass({ maxUses: 0 })).code],
  ])("refuses a(n) %s pass", async (_label, makeCode) => {
    present(await makeCode());
    expect(await decideSignUp({ email: "new@example.com" })).toBe("closed");
  });

  // Someone already in has vouched for the address, which is the same act as
  // handing out a pass. Without this a tester could not invite their partner
  // — the product's core use — while the site is closed.
  it("lets an address with a pending invitation in", async () => {
    const [h] = await db
      .insert(households)
      .values({ name: "H", ownerId: "existing" })
      .returning();
    await db.insert(invitations).values({
      householdId: h.id,
      email: "partner@example.com",
      invitedBy: "existing",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await decideSignUp({ email: "Partner@Example.com" })).toBe("allowed");
  });

  it("does not count an expired or non-pending invitation", async () => {
    const [h] = await db
      .insert(households)
      .values({ name: "H", ownerId: "existing" })
      .returning();
    await db.insert(invitations).values({
      householdId: h.id,
      email: "late@example.com",
      invitedBy: "existing",
      expiresAt: new Date(Date.now() - 60_000),
    });
    await db.insert(invitations).values({
      householdId: h.id,
      email: "declined@example.com",
      invitedBy: "existing",
      status: "revoked",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await decideSignUp({ email: "late@example.com" })).toBe("closed");
    expect(await decideSignUp({ email: "declined@example.com" })).toBe("closed");
  });

  // A unit test driving the callback has no request scope. That must read
  // as "no pass presented", never as a way in.
  it("treats an unreadable cookie jar as no pass", async () => {
    cookiesThrow = true;
    expect(await decideSignUp({ email: "new@example.com" })).toBe("closed");
    expect(await decideSignUp({ email: "existing@example.com" })).toBe("allowed");
  });
});

describe("recordSignUpPass", () => {
  it("ties the new user to the pass in the cookie", async () => {
    await db.insert(users).values({ id: "fresh", email: "fresh@example.com" });
    const pass = await createBetaPass();
    present(pass.code);

    await recordSignUpPass({ id: "fresh" });

    expect(await findBetaPassRedemption("fresh")).toEqual({ passId: pass.id, userId: "fresh" });
    // The redemption is recorded even for a pass that has meanwhile stopped
    // being usable — the use was already consumed at sign-in.
    expect(await findBetaPass(pass.code)).not.toBeNull();
  });

  it("records nothing without a cookie, without a matching pass, or without a user id", async () => {
    await db.insert(users).values({ id: "fresh", email: "fresh@example.com" });
    await recordSignUpPass({ id: "fresh" });
    expect(await findBetaPassRedemption("fresh")).toBeNull();

    present("not-a-code");
    await recordSignUpPass({ id: "fresh" });
    expect(await findBetaPassRedemption("fresh")).toBeNull();

    const pass = await createBetaPass();
    present(pass.code);
    await recordSignUpPass({ id: null });
    await recordSignUpPass({});
    expect(await db.select().from(betaPassRedemptions)).toHaveLength(0);
  });
});

describe("SIGN_IN_CLOSED_REDIRECT", () => {
  // Auth.js's default `redirect` callback accepts a relative URL and resolves
  // it against the deployment's origin. An absolute URL would hard-code a
  // domain that is configuration everywhere else (SITE_URL).
  it("is a relative path the landing page understands", () => {
    expect(SIGN_IN_CLOSED_REDIRECT).toBe("/?signin=closed");
  });
});
