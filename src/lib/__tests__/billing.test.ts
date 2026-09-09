import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { createApartmentRow } from "../apartments-store";
import {
  CREDITS_PER_PURCHASE,
  billingEnabled,
  grantApartmentCredits,
  readCreditBalance,
} from "../billing";

const ENVELOPE = JSON.stringify({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "QUJD" });
const ORIGINAL_STRIPE = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_MAX = process.env.MAX_APARTMENTS;

let hid: number;
let n = 0;
const newId = () => `10000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

async function counters() {
  const [row] = await db
    .select({
      granted: households.apartmentCreditsGranted,
      used: households.apartmentsEverAdded,
    })
    .from(households)
    .where(eq(households.id, hid));
  return row;
}

async function activeCount() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apartments)
    .where(eq(apartments.householdId, hid));
  return Number(count);
}

beforeEach(async () => {
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.MAX_APARTMENTS;
});

afterEach(() => {
  if (ORIGINAL_STRIPE === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE;
  if (ORIGINAL_MAX === undefined) delete process.env.MAX_APARTMENTS;
  else process.env.MAX_APARTMENTS = ORIGINAL_MAX;
});

const enableBilling = () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
};

describe("billingEnabled", () => {
  // The self-hoster default. A deployment that cannot take money must not
  // enforce a paywall — there would be no way to lift it.
  it("is off when STRIPE_SECRET_KEY is unset or blank", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(billingEnabled()).toBe(false);
    process.env.STRIPE_SECRET_KEY = "   ";
    expect(billingEnabled()).toBe(false);
  });

  it("is on when a key is configured", () => {
    enableBilling();
    expect(billingEnabled()).toBe(true);
  });
});

describe("createApartmentRow with billing OFF", () => {
  it("ignores credits entirely — a self-hoster is never refused", async () => {
    for (let i = 0; i < 15; i++) {
      await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    }
    expect(await activeCount()).toBe(15);
    // The counter is not even touched, so switching billing on later does not
    // present the self-hoster with a bill for their history.
    expect((await counters()).used).toBe(0);
  });
});

describe("createApartmentRow with billing ON", () => {
  beforeEach(enableBilling);

  it("refuses with 402 when the household has no credits", async () => {
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ status: 402, message: "No apartment credits left" });
    expect(await activeCount()).toBe(0);
  });

  it("allows exactly as many adds as credits granted", async () => {
    await grantApartmentCredits(hid, 3);
    for (let i = 0; i < 3; i++) {
      await expect(
        createApartmentRow(hid, { id: newId(), envelope: ENVELOPE }),
        `add ${i + 1}`
      ).resolves.toBeTruthy();
    }
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ status: 402 });
  });

  // The term the landing page sells, and the one most likely to be disputed.
  it("does NOT refund a credit when an apartment is deleted", async () => {
    await grantApartmentCredits(hid, 2);
    const first = await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });

    await db.delete(apartments).where(eq(apartments.id, first.id));

    expect(await activeCount()).toBe(1);
    expect((await counters()).used).toBe(2);
    // Room in the comparison, but no credit left to fill it with.
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ status: 402 });
  });

  it("stacks a second purchase on top of the first", async () => {
    await grantApartmentCredits(hid, 2);
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ status: 402 });

    await grantApartmentCredits(hid, 2);
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).resolves.toBeTruthy();
    expect((await counters())).toMatchObject({ granted: 4, used: 3 });
  });

  describe("a credit is never burned by a failed create", () => {
    it("gives it back when the id is a duplicate", async () => {
      await grantApartmentCredits(hid, 2);
      const id = newId();
      await createApartmentRow(hid, { id, envelope: ENVELOPE });
      await expect(
        createApartmentRow(hid, { id, envelope: ENVELOPE })
      ).rejects.toMatchObject({ message: "Duplicate id" });

      expect((await counters()).used).toBe(1);
      // The second credit is still spendable.
      await expect(
        createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
      ).resolves.toBeTruthy();
    });

    it("gives it back when the active-row cap refuses the insert", async () => {
      process.env.MAX_APARTMENTS = "1";
      await grantApartmentCredits(hid, 5);
      await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
      await expect(
        createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
      ).rejects.toMatchObject({ message: "Apartment limit reached" });

      // One row added, one credit used — not two.
      expect((await counters()).used).toBe(1);
    });
  });

  it("does not let concurrent adds overspend the last credit", async () => {
    await grantApartmentCredits(hid, 3);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
      )
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await activeCount()).toBe(3);
    expect((await counters()).used).toBe(3);
  });

  it("counts per household", async () => {
    await grantApartmentCredits(hid, 1);
    const [other] = await db
      .insert(households)
      .values({ name: "Other", ownerId: "o" })
      .returning();
    await grantApartmentCredits(other.id, 1);

    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ status: 402 });
    await expect(
      createApartmentRow(other.id, { id: newId(), envelope: ENVELOPE })
    ).resolves.toBeTruthy();
  });
});

describe("grantApartmentCredits", () => {
  it("refuses a non-positive or fractional grant rather than corrupting the ledger", async () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      await expect(grantApartmentCredits(hid, bad), String(bad)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect((await counters()).granted).toBe(0);
  });

  it("grants one purchase worth of credits", async () => {
    await grantApartmentCredits(hid, CREDITS_PER_PURCHASE);
    expect((await counters()).granted).toBe(40);
  });
});

describe("readCreditBalance", () => {
  it("reports granted, used and remaining", async () => {
    enableBilling();
    await grantApartmentCredits(hid, 5);
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    expect(await readCreditBalance(hid)).toEqual({
      granted: 5,
      used: 1,
      remaining: 4,
      enabled: true,
    });
  });

  it("reports enabled:false when billing is off, so the UI can hide the paywall", async () => {
    expect((await readCreditBalance(hid)).enabled).toBe(false);
  });

  it("never reports negative remaining", async () => {
    enableBilling();
    await db
      .update(households)
      .set({ apartmentCreditsGranted: 1, apartmentsEverAdded: 5 })
      .where(eq(households.id, hid));
    expect((await readCreditBalance(hid)).remaining).toBe(0);
  });
});
