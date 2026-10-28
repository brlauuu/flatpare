import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartmentCharges, apartments, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { createApartmentRow } from "../apartments-store";
import {
  CREDITS_PER_PURCHASE,
  billingEnabled,
  chargeFirstProcessing,
  chargeRecompute,
  chargeReprocess,
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
  await db.delete(apartmentCharges);
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

  // #413: an apartment someone only rates and describes calls nothing
  // outside the app, so creating it is free — even with no credits at all.
  it("spends no credit, even with none left", async () => {
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    expect(await activeCount()).toBe(2);
    expect((await counters()).used).toBe(0);
  });

  it("still enforces the active-row cap", async () => {
    process.env.MAX_APARTMENTS = "1";
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ message: "Apartment limit reached" });
  });
});

describe("chargeFirstProcessing", () => {
  it("is free when billing is off and records nothing", async () => {
    await chargeFirstProcessing(hid, newId());
    expect((await counters()).used).toBe(0);
    expect(await db.select().from(apartmentCharges)).toEqual([]);
  });

  describe("with billing ON", () => {
    beforeEach(enableBilling);

    it("refuses with 402 when the household has no credits", async () => {
      const id = newId();
      await expect(chargeFirstProcessing(hid, id)).rejects.toMatchObject({
        status: 402,
        message: "No apartment credits left",
      });
      expect(await db.select().from(apartmentCharges)).toEqual([]);
    });

    it("spends one credit per apartment, the first time only", async () => {
      await grantApartmentCredits(hid, 2);
      const id = newId();
      await chargeFirstProcessing(hid, id);
      // The geocode after the PDF, a retry, a second distance pass: free.
      await chargeFirstProcessing(hid, id);
      await chargeFirstProcessing(hid, id);
      expect((await counters()).used).toBe(1);

      await chargeFirstProcessing(hid, newId());
      expect((await counters()).used).toBe(2);
      await expect(chargeFirstProcessing(hid, newId())).rejects.toMatchObject({ status: 402 });
      // An apartment already charged still processes at zero credits.
      await expect(chargeFirstProcessing(hid, id)).resolves.toBeUndefined();
    });

    // The term the landing page sells, and the one most likely to be disputed.
    it("does NOT refund a credit when the apartment is deleted", async () => {
      await grantApartmentCredits(hid, 1);
      const created = await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
      await chargeFirstProcessing(hid, created.id);
      await db.delete(apartments).where(eq(apartments.id, created.id));
      expect((await counters()).used).toBe(1);
      await expect(chargeFirstProcessing(hid, newId())).rejects.toMatchObject({ status: 402 });
    });

    it("stacks a second purchase on top of the first", async () => {
      await grantApartmentCredits(hid, 1);
      await chargeFirstProcessing(hid, newId());
      await expect(chargeFirstProcessing(hid, newId())).rejects.toMatchObject({ status: 402 });
      await grantApartmentCredits(hid, 2);
      await chargeFirstProcessing(hid, newId());
      expect(await counters()).toMatchObject({ granted: 3, used: 2 });
    });

    it("charges once when the same apartment is processed concurrently", async () => {
      await grantApartmentCredits(hid, 5);
      const id = newId();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => chargeFirstProcessing(hid, id))
      );
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      expect((await counters()).used).toBe(1);
    });

    it("takes the claim back when the credit cannot be spent", async () => {
      const id = newId();
      await expect(chargeFirstProcessing(hid, id)).rejects.toMatchObject({ status: 402 });
      // After buying, the same apartment is charged rather than waved through.
      await grantApartmentCredits(hid, 1);
      await chargeFirstProcessing(hid, id);
      expect((await counters()).used).toBe(1);
    });

    it("does not let concurrent first processings overspend the last credit", async () => {
      await grantApartmentCredits(hid, 3);
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => chargeFirstProcessing(hid, newId()))
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect((await counters()).used).toBe(3);
      expect(await db.select().from(apartmentCharges)).toHaveLength(3);
    });

    it("counts per household", async () => {
      await grantApartmentCredits(hid, 1);
      const [other] = await db
        .insert(households)
        .values({ name: "Other", ownerId: "o" })
        .returning();
      await grantApartmentCredits(other.id, 1);
      const id = newId();
      await chargeFirstProcessing(hid, id);
      // The same id in another household is another apartment's charge.
      await chargeFirstProcessing(other.id, id);
      expect((await counters()).used).toBe(1);
      await expect(chargeFirstProcessing(other.id, newId())).rejects.toMatchObject({ status: 402 });
    });
  });
});

describe("chargeReprocess and chargeRecompute", () => {
  it("are free when billing is off", async () => {
    await chargeReprocess(hid, newId());
    await chargeRecompute(hid);
    expect((await counters()).used).toBe(0);
  });

  describe("with billing ON", () => {
    beforeEach(enableBilling);

    it("a reprocess spends one credit every time, and makes later calls free", async () => {
      await grantApartmentCredits(hid, 3);
      const id = newId();
      await chargeReprocess(hid, id);
      // An apartment never charged before (an imported one): the calls the
      // reprocess makes are covered by it.
      await chargeFirstProcessing(hid, id);
      expect((await counters()).used).toBe(1);
      await chargeReprocess(hid, id);
      expect((await counters()).used).toBe(2);
    });

    it("a recompute spends one credit for the whole run", async () => {
      await grantApartmentCredits(hid, 1);
      await chargeRecompute(hid);
      expect((await counters()).used).toBe(1);
      await expect(chargeRecompute(hid)).rejects.toMatchObject({ status: 402 });
      await expect(chargeReprocess(hid, newId())).rejects.toMatchObject({ status: 402 });
    });
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
    await chargeFirstProcessing(hid, newId());
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
