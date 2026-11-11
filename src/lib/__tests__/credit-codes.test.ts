import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditCodeRedemptions, creditCodes, households } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import {
  CODE_ALREADY_USED,
  CODE_NOT_VALID,
  createCreditCode,
  newCreditCode,
  normalizeCreditCode,
  redeemCreditCode,
  revokeCreditCode,
} from "../credit-codes";

beforeEach(async () => {
  await db.delete(creditCodeRedemptions);
  await db.delete(creditCodes);
  await db.delete(households);
  await db.delete(users);
});

async function makeHousehold(n: number): Promise<number> {
  const id = `u-${n}-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email: `${id}@example.com` });
  const [h] = await db.insert(households).values({ name: "H", ownerId: id }).returning({ id: households.id });
  return h.id;
}

async function grantedOn(householdId: number): Promise<number> {
  const [row] = await db
    .select({ granted: households.apartmentCreditsGranted })
    .from(households)
    .where(eq(households.id, householdId));
  return row.granted;
}

async function usesOf(code: string): Promise<number> {
  const [row] = await db.select({ uses: creditCodes.uses }).from(creditCodes).where(eq(creditCodes.code, code));
  return row.uses;
}

describe("codes", () => {
  it("are 32 hex characters and do not repeat", () => {
    const a = newCreditCode();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newCreditCode()).not.toBe(a);
  });

  it("forgive spaces, dashes and capitals", () => {
    expect(normalizeCreditCode(" ABCD-ef01 2345 ")).toBe("abcdef012345");
  });

  it("refuse a non-positive number of credits", async () => {
    await expect(createCreditCode({ credits: 0 })).rejects.toThrow("positive integer");
    await expect(createCreditCode({ credits: 1.5 })).rejects.toThrow("positive integer");
  });
});

describe("redeemCreditCode", () => {
  it("adds the code's credits to the household and counts a use", async () => {
    const hid = await makeHousehold(1);
    const { code } = await createCreditCode({ credits: 20 });
    expect(await redeemCreditCode(hid, code.toUpperCase())).toBe(20);
    expect(await grantedOn(hid)).toBe(20);
    expect(await usesOf(code)).toBe(1);
  });

  it("is redeemed once per household, and a second try changes nothing", async () => {
    const hid = await makeHousehold(1);
    const { code } = await createCreditCode({ credits: 10 });
    await redeemCreditCode(hid, code);
    await expect(redeemCreditCode(hid, code)).rejects.toMatchObject({ status: 409, message: CODE_ALREADY_USED });
    expect(await grantedOn(hid)).toBe(10);
    expect(await usesOf(code)).toBe(1);
  });

  it("tops up several households with one code", async () => {
    const a = await makeHousehold(1);
    const b = await makeHousehold(2);
    const { code } = await createCreditCode({ credits: 5 });
    await redeemCreditCode(a, code);
    await redeemCreditCode(b, code);
    expect([await grantedOn(a), await grantedOn(b)]).toEqual([5, 5]);
  });

  it.each([
    ["unknown", async () => newCreditCode()],
    ["malformed", async () => "not a code"],
    ["revoked", async () => {
      const { code } = await createCreditCode({ credits: 5 });
      expect(await revokeCreditCode(code)).toBe(true);
      return code;
    }],
    ["expired", async () => (await createCreditCode({ credits: 5, expiresAt: new Date(Date.now() - 1000) })).code],
    ["used up", async () => {
      const { code } = await createCreditCode({ credits: 5, maxUses: 1 });
      await redeemCreditCode(await makeHousehold(9), code);
      return code;
    }],
  ])("refuses a %s code with one fixed message that does not repeat it", async (_, make) => {
    const hid = await makeHousehold(1);
    const code = await make();
    const err = await redeemCreditCode(hid, code).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, message: CODE_NOT_VALID });
    expect(String((err as Error).message)).not.toContain(code);
    expect(await grantedOn(hid)).toBe(0);
  });

  it("takes back the claim of a refused code, so it never blocks the household", async () => {
    const hid = await makeHousehold(1);
    const { code } = await createCreditCode({ credits: 5, expiresAt: new Date(Date.now() - 1000) });
    await expect(redeemCreditCode(hid, code)).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(creditCodeRedemptions)).toEqual([]);
  });

  it("lets exactly max_uses households through when they race (8 at a 3-use code)", async () => {
    const homes = await Promise.all(Array.from({ length: 8 }, (_, i) => makeHousehold(i)));
    const { code } = await createCreditCode({ credits: 7, maxUses: 3 });
    const results = await Promise.allSettled(homes.map((h) => redeemCreditCode(h, code)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await usesOf(code)).toBe(3);
    const granted = await Promise.all(homes.map(grantedOn));
    expect(granted.filter((g) => g === 7)).toHaveLength(3);
    expect(granted.filter((g) => g === 0)).toHaveLength(5);
    expect(await db.select().from(creditCodeRedemptions)).toHaveLength(3);
  });

  it("grants once when one household races itself (8 at once)", async () => {
    const hid = await makeHousehold(1);
    const { code } = await createCreditCode({ credits: 4 });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => redeemCreditCode(hid, code)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await grantedOn(hid)).toBe(4);
    expect(await usesOf(code)).toBe(1);
  });
});

describe("revokeCreditCode", () => {
  it("stops the code but keeps what it already added", async () => {
    const hid = await makeHousehold(1);
    const { code } = await createCreditCode({ credits: 6 });
    await redeemCreditCode(hid, code);
    expect(await revokeCreditCode(code)).toBe(true);
    expect(await revokeCreditCode(code)).toBe(false);
    expect(await grantedOn(hid)).toBe(6);
  });
});
