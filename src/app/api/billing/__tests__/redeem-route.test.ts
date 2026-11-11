/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditCodeRedemptions, creditCodes, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";
import { createCreditCode } from "@/lib/credit-codes";

const currentSession = { householdId: 0, userId: "o", role: "member" as "owner" | "member" };
let signedIn = true;
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

import { POST } from "../redeem/route";
import * as codes from "@/lib/credit-codes";

let hid: number;

beforeEach(async () => {
  signedIn = true;
  await db.delete(creditCodeRedemptions);
  await db.delete(creditCodes);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  // A plain member: redeeming is not an owner's privilege (#294).
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "member" });
  currentSession.householdId = hid;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.FLATPARE_CREDITS = "on";
});

afterEach(() => {
  delete process.env.FLATPARE_CREDITS;
  vi.restoreAllMocks();
});

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/billing/redeem", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

async function granted(): Promise<number> {
  const [row] = await db
    .select({ g: households.apartmentCreditsGranted })
    .from(households)
    .where(eq(households.id, hid));
  return row.g;
}

describe("POST /api/billing/redeem (#492)", () => {
  it("adds the code's credits for any member and answers how many", async () => {
    const { code } = await createCreditCode({ credits: 25 });
    const res = await post({ code });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ credits: 25 });
    expect(await granted()).toBe(25);
  });

  it("answers a refused code with the fixed message", async () => {
    const res = await post({ code: "0".repeat(32) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That code is not valid." });
  });

  it.each([["not json"], [{}], [{ code: 5 }], [{ code: "x".repeat(101) }]])(
    "answers a malformed body %j with the same fixed message",
    async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "That code is not valid." });
    }
  );

  it("is not there where credits are not counted (self-hosted)", async () => {
    delete process.env.FLATPARE_CREDITS;
    const { code } = await createCreditCode({ credits: 25 });
    const res = await post({ code });
    expect(res.status).toBe(404);
    expect(await granted()).toBe(0);
  });

  it("answers 401 when signed out", async () => {
    signedIn = false;
    expect((await post({ code: "a".repeat(32) })).status).toBe(401);
  });

  it("never logs the code when something unexpected fails", async () => {
    const code = "c0de".repeat(8);
    vi.spyOn(codes, "redeemCreditCode").mockRejectedValue(new Error(`Failed query: params: ${code}`));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ code });
    expect(res.status).toBe(500);
    expect(JSON.stringify(log.mock.calls)).not.toContain(code);
    expect(JSON.stringify(await res.json())).not.toContain(code);
  });
});
