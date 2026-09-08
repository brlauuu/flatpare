import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { createApartmentRow } from "../apartments-store";

const ENVELOPE = JSON.stringify({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "QUJD" });
const ORIGINAL = process.env.MAX_APARTMENTS;

let hid: number;
let otherHid: number;
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

async function countApartments(householdId: number): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apartments)
    .where(eq(apartments.householdId, householdId));
  return Number(count);
}

beforeEach(async () => {
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  const [other] = await db.insert(households).values({ name: "Other", ownerId: "o" }).returning();
  hid = h.id;
  otherHid = other.id;
  delete process.env.MAX_APARTMENTS;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MAX_APARTMENTS;
  else process.env.MAX_APARTMENTS = ORIGINAL;
});

describe("createApartmentRow", () => {
  // The self-hoster default. This is the regression the issue calls out
  // explicitly, so it gets its own test rather than being implied.
  it("allows unlimited apartments when MAX_APARTMENTS is unset", async () => {
    for (let i = 0; i < 25; i++) {
      await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    }
    expect(await countApartments(hid)).toBe(25);
  });

  it("allows unlimited apartments when MAX_APARTMENTS is empty", async () => {
    process.env.MAX_APARTMENTS = "";
    for (let i = 0; i < 12; i++) {
      await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    }
    expect(await countApartments(hid)).toBe(12);
  });

  it("allows exactly the configured number", async () => {
    process.env.MAX_APARTMENTS = "3";
    for (let i = 0; i < 3; i++) {
      await expect(
        createApartmentRow(hid, { id: newId(), envelope: ENVELOPE }),
        `create ${i + 1}`
      ).resolves.toBeTruthy();
    }
    expect(await countApartments(hid)).toBe(3);
  });

  it("refuses the row that would exceed MAX_APARTMENTS", async () => {
    process.env.MAX_APARTMENTS = "2";
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ status: 409, message: "Apartment limit reached" });
    expect(await countApartments(hid)).toBe(2);
  });

  it("counts per household, not globally", async () => {
    process.env.MAX_APARTMENTS = "1";
    await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await expect(
      createApartmentRow(otherHid, { id: newId(), envelope: ENVELOPE })
    ).resolves.toBeTruthy();
    expect(await countApartments(hid)).toBe(1);
    expect(await countApartments(otherHid)).toBe(1);
  });

  it("frees a slot when an apartment is deleted", async () => {
    process.env.MAX_APARTMENTS = "1";
    const created = await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).rejects.toMatchObject({ status: 409 });

    await db.delete(apartments).where(eq(apartments.id, created.id));
    await expect(
      createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
    ).resolves.toBeTruthy();
  });

  it("does not let concurrent creates both take the last slot", async () => {
    process.env.MAX_APARTMENTS = "3";
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        createApartmentRow(hid, { id: newId(), envelope: ENVELOPE })
      )
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await countApartments(hid)).toBe(3);
  });

  it("still reports a duplicate id as Duplicate id, not as the limit error", async () => {
    process.env.MAX_APARTMENTS = "10";
    const id = newId();
    await createApartmentRow(hid, { id, envelope: ENVELOPE });
    await expect(createApartmentRow(hid, { id, envelope: ENVELOPE })).rejects.toMatchObject({
      status: 409,
      message: "Duplicate id",
    });
  });

  it("never opens the envelope — the stored ciphertext is passed through verbatim", async () => {
    const created = await createApartmentRow(hid, { id: newId(), envelope: ENVELOPE });
    expect(created.envelope).toBe(ENVELOPE);
  });
});
