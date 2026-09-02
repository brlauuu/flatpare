import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  apartments,
} from "@/lib/db/schema";
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

describe("household scoping", () => {
  it("keeps apartments in separate households apart", async () => {
    const a = await seedHousehold("user-a", "A");
    const b = await seedHousehold("user-b", "B");

    await db.insert(apartments).values({ name: "A flat", householdId: a.id });
    await db.insert(apartments).values({ name: "B flat", householdId: b.id });

    const forA = await db
      .select()
      .from(apartments)
      .where(eq(apartments.householdId, a.id));

    expect(forA).toHaveLength(1);
    expect(forA[0].name).toBe("A flat");
  });

  it("refuses an apartment with no household", async () => {
    await expect(
      // @ts-expect-error householdId is required — this must fail at runtime too
      db.insert(apartments).values({ name: "orphan" })
    ).rejects.toThrow();
  });

  it("cascades apartments when a household is deleted", async () => {
    const a = await seedHousehold("user-a", "A");
    await db.insert(apartments).values({ name: "A flat", householdId: a.id });

    await db.delete(households).where(eq(households.id, a.id));

    expect(await db.select().from(apartments)).toHaveLength(0);
  });
});
