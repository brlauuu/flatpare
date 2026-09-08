import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, apartments } from "@/lib/db/schema";
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

const PLAIN = JSON.stringify({ v: 0, data: {} });

describe("household scoping", () => {
  it("keeps apartments in separate households apart", async () => {
    const a = await seedHousehold("user-a", "A");
    const b = await seedHousehold("user-b", "B");

    await db.insert(apartments).values({ id: "a1", householdId: a.id, envelope: PLAIN });
    await db.insert(apartments).values({ id: "b1", householdId: b.id, envelope: PLAIN });

    const forA = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(eq(apartments.householdId, a.id));
    expect(forA.map((r) => r.id)).toEqual(["a1"]);
  });

  it("cascades apartments when the household is deleted", async () => {
    const a = await seedHousehold("user-a", "A");
    await db.insert(apartments).values({ id: "a1", householdId: a.id, envelope: PLAIN });

    await db.delete(households).where(eq(households.id, a.id));

    const left = await db.select({ id: apartments.id }).from(apartments);
    expect(left).toHaveLength(0);
  });

  it("defaults version to 1", async () => {
    const a = await seedHousehold("user-a", "A");
    await db.insert(apartments).values({ id: "a1", householdId: a.id, envelope: PLAIN });
    const [row] = await db.select().from(apartments);
    expect(row.version).toBe(1);
  });
});
