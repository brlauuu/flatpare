import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import {
  resolveHouseholdForUser,
  assertMembership,
  ForbiddenError,
} from "../household";

beforeEach(async () => {
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeUser(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.com` });
}

describe("resolveHouseholdForUser", () => {
  it("creates a household and makes the first user its owner", async () => {
    await makeUser("u1");
    const id = await resolveHouseholdForUser("u1");

    const [h] = await db.select().from(households).where(eq(households.id, id));
    expect(h.ownerId).toBe("u1");

    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, id));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });

  it("reuses the household on a second sign-in", async () => {
    await makeUser("u1");
    const first = await resolveHouseholdForUser("u1");
    const second = await resolveHouseholdForUser("u1");
    expect(second).toBe(first);
    expect(await db.select().from(households)).toHaveLength(1);
  });

  it("does not create a second household for an invited member", async () => {
    await makeUser("owner");
    await makeUser("invitee");
    const id = await resolveHouseholdForUser("owner");
    await db
      .insert(householdMembers)
      .values({ householdId: id, userId: "invitee", role: "member" });

    expect(await resolveHouseholdForUser("invitee")).toBe(id);
    expect(await db.select().from(households)).toHaveLength(1);
  });
});

describe("assertMembership", () => {
  it("returns the role for a member", async () => {
    await makeUser("u1");
    const id = await resolveHouseholdForUser("u1");
    expect(await assertMembership(id, "u1")).toBe("owner");
  });

  it("throws for a non-member — this is the cross-tenant guard", async () => {
    await makeUser("u1");
    await makeUser("outsider");
    const id = await resolveHouseholdForUser("u1");
    await expect(assertMembership(id, "outsider")).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});
