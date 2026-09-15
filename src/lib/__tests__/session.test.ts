/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// Every route suite mocks @/lib/session wholesale, so the module itself was
// never executed by any test despite being the shared authentication and
// tenant-scope check. This file executes it for real; only `auth()` — the
// Auth.js boundary — is stubbed.
const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

import { requireHousehold, resolveHouseholdIdentity } from "@/lib/session";
import { UnauthorizedError } from "@/lib/household";

/** A session shaped the way the jwt/session callbacks in src/auth.ts stamp it. */
function session(over: Record<string, unknown> = {}): Session {
  return {
    user: { id: "u1", name: "Ana", email: "ana@example.com" },
    householdId: 7,
    role: "owner",
    expires: new Date(Date.now() + 3_600_000).toISOString(),
    ...over,
  } as unknown as Session;
}

beforeEach(() => {
  authMock.mockReset();
});

describe("requireHousehold", () => {
  it("returns the household, user and role from a complete session", async () => {
    authMock.mockResolvedValue(session());
    await expect(requireHousehold()).resolves.toEqual({
      householdId: 7,
      userId: "u1",
      role: "owner",
    });
  });

  it("carries the member role through, not just owner", async () => {
    // Role decides who may remove members and revoke invitations, so it has to
    // survive this hop unchanged rather than being defaulted.
    authMock.mockResolvedValue(session({ role: "member" }));
    await expect(requireHousehold()).resolves.toMatchObject({ role: "member" });
  });

  describe("throws UnauthorizedError when any part is missing", () => {
    // Each of the three is load-bearing: without all of them the caller cannot
    // be scoped to a tenant, and answering anything but 401 would be a leak.
    const cases: Array<[string, Session | null]> = [
      ["no session at all", null],
      ["session with no user", session({ user: undefined })],
      ["user with no id", session({ user: { name: "Ana" } })],
      ["no householdId", session({ householdId: undefined })],
      ["no role", session({ role: undefined })],
      ["householdId is null", session({ householdId: null })],
      ["role is null", session({ role: null })],
    ];

    it.each(cases)("%s", async (_label, value) => {
      authMock.mockResolvedValue(value);
      await expect(requireHousehold()).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  it("rejects householdId 0 rather than treating it as a household", async () => {
    // Guarding this explicitly because the check is falsiness, not a null
    // test — a numeric id of 0 must not read as "authenticated".
    authMock.mockResolvedValue(session({ householdId: 0 }));
    await expect(requireHousehold()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lets an auth() failure propagate rather than degrading to 401", async () => {
    // A broken session store is a 500, not "you are signed out" — masking it
    // would turn an outage into a silent sign-out for every user.
    authMock.mockRejectedValue(new Error("session store down"));
    await expect(requireHousehold()).rejects.toThrow("session store down");
  });
});

describe("resolveHouseholdIdentity", () => {
  it("returns identity for an authenticated household", async () => {
    authMock.mockResolvedValue(session());
    await expect(resolveHouseholdIdentity()).resolves.toEqual({
      userId: "u1",
      householdId: 7,
      userName: "Ana",
    });
  });

  it("falls back to 'Member' when the session has no name", async () => {
    // OAuth providers do not always supply one, and the store renders this.
    authMock.mockResolvedValue(session({ user: { id: "u1" } }));
    await expect(resolveHouseholdIdentity()).resolves.toMatchObject({
      userName: "Member",
    });
  });

  it("does NOT require a role, unlike requireHousehold", async () => {
    // The deliberate difference between the two: the layouts pass this
    // straight to the store as a prop and have no use for the role.
    authMock.mockResolvedValue(session({ role: undefined }));
    await expect(resolveHouseholdIdentity()).resolves.toMatchObject({
      householdId: 7,
      userId: "u1",
    });
  });

  describe("returns null rather than throwing", () => {
    // Mirrors the old CryptoGate early-return: the layouts render a shell for
    // a signed-in user with no household instead of erroring.
    const cases: Array<[string, Session | null]> = [
      ["no session at all", null],
      ["session with no user", session({ user: undefined })],
      ["user with no id", session({ user: { name: "Ana" } })],
      ["no householdId", session({ householdId: undefined })],
      ["householdId is null", session({ householdId: null })],
      ["householdId is 0", session({ householdId: 0 })],
    ];

    it.each(cases)("%s", async (_label, value) => {
      authMock.mockResolvedValue(value);
      await expect(resolveHouseholdIdentity()).resolves.toBeNull();
    });
  });
});
