/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { apartments, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";
import { grantApartmentCredits, consumeApartmentCredit } from "@/lib/billing";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

import { GET as statusGET } from "../status/route";

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

let hid: number;
let otherHid: number;

beforeEach(async () => {
  signedIn = true;
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values([
    { id: "o", email: "o@example.com" },
    { id: "x", email: "x@example.com" },
  ]);
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  const [other] = await db
    .insert(households)
    .values({ name: "Other", ownerId: "x" })
    .returning();
  hid = h.id;
  otherHid = other.id;
  await db.insert(householdMembers).values([
    { householdId: hid, userId: "o", role: "owner" },
    { householdId: otherHid, userId: "x", role: "owner" },
  ]);
  currentSession.householdId = hid;
  currentSession.userId = "o";
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
});

async function status() {
  const res = await statusGET();
  return { status: res.status, body: await res.json() };
}

describe("GET /api/billing/status", () => {
  it("reports zero for a household that has never purchased", async () => {
    const { status: code, body } = await status();
    expect(code).toBe(200);
    expect(body).toEqual({ granted: 0, used: 0, remaining: 0, enabled: true });
  });

  it("reports the grant after a purchase", async () => {
    await grantApartmentCredits(hid, 40);
    const { body } = await status();
    expect(body).toMatchObject({ granted: 40, used: 0, remaining: 40 });
  });

  it("counts spent credits against remaining, and never below zero", async () => {
    await grantApartmentCredits(hid, 2);
    expect(await consumeApartmentCredit(hid)).toBe(true);
    expect(await consumeApartmentCredit(hid)).toBe(true);
    // A third consume fails rather than pushing used past granted.
    expect(await consumeApartmentCredit(hid)).toBe(false);

    const { body } = await status();
    expect(body).toMatchObject({ granted: 2, used: 2, remaining: 0 });
  });

  it("reports enabled:false when billing is off", async () => {
    // The self-hoster's case. `enabled:false` means unlimited, not zero — the
    // client must not read granted:0 here as "needs to buy".
    delete process.env.STRIPE_SECRET_KEY;
    const { body } = await status();
    expect(body).toMatchObject({ enabled: false });
  });

  it("is scoped to the caller's household", async () => {
    // The polling loop reads this to decide whether the paywall lifts, so a
    // leak across households would lift someone else's.
    await grantApartmentCredits(otherHid, 40);
    const { body } = await status();
    expect(body).toMatchObject({ granted: 0 });

    currentSession.householdId = otherHid;
    currentSession.userId = "x";
    const mine = await status();
    expect(mine.body).toMatchObject({ granted: 40 });
  });

  it("401s when there is no session", async () => {
    signedIn = false;
    const { status: code } = await status();
    expect(code).toBe(401);
  });
});
