import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import {
  resolveHouseholdForUser,
  createHouseholdForUser,
  assertMembership,
  listMembers,
  removeMember,
  ForbiddenError,
  HouseholdError,
} from "../household";

beforeEach(async () => {
  await db.delete(invitations);
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeUser(id: string) {
  await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
}

describe("resolveHouseholdForUser", () => {
  it("creates a household and makes the first user its owner", async () => {
    await makeUser("u1");
    const id = await resolveHouseholdForUser("u1");
    expect(id).not.toBeNull();

    const [h] = await db.select().from(households).where(eq(households.id, id!));
    expect(h.ownerId).toBe("u1");

    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, id!));
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
    const id = (await resolveHouseholdForUser("owner"))!;
    await db
      .insert(householdMembers)
      .values({ householdId: id, userId: "invitee", role: "member" });

    expect(await resolveHouseholdForUser("invitee")).toBe(id);
    expect(await db.select().from(households)).toHaveLength(1);
  });

  it("returns null instead of creating when a pending invitation matches the email", async () => {
    await makeUser("owner");
    await makeUser("invitee");
    const id = (await resolveHouseholdForUser("owner"))!;
    await db.insert(invitations).values({
      householdId: id,
      email: "invitee@example.com",
      invitedBy: "owner",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await resolveHouseholdForUser("invitee")).toBeNull();
    expect(await db.select().from(households)).toHaveLength(1);
  });

  it("ignores expired and non-pending invitations", async () => {
    await makeUser("owner");
    await makeUser("invitee");
    const id = (await resolveHouseholdForUser("owner"))!;
    await db.insert(invitations).values({
      householdId: id,
      email: "invitee@example.com",
      invitedBy: "owner",
      expiresAt: new Date(Date.now() - 1),
    });
    await db.insert(invitations).values({
      householdId: id,
      email: "invitee@example.com",
      invitedBy: "owner",
      status: "revoked",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await resolveHouseholdForUser("invitee")).not.toBeNull();
    expect(await db.select().from(households)).toHaveLength(2);
  });
});

describe("createHouseholdForUser", () => {
  it("creates an owned household", async () => {
    await makeUser("u1");
    const id = await createHouseholdForUser("u1");
    expect(await assertMembership(id, "u1")).toBe("owner");
  });
});

describe("assertMembership", () => {
  it("returns the role for a member", async () => {
    await makeUser("u1");
    const id = (await resolveHouseholdForUser("u1"))!;
    expect(await assertMembership(id, "u1")).toBe("owner");
  });

  it("throws for a non-member — this is the cross-tenant guard", async () => {
    await makeUser("u1");
    await makeUser("outsider");
    const id = (await resolveHouseholdForUser("u1"))!;
    await expect(assertMembership(id, "outsider")).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});

describe("listMembers / removeMember", () => {
  async function seeded() {
    await makeUser("o");
    await makeUser("m");
    await makeUser("x");
    const id = await createHouseholdForUser("o");
    await db
      .insert(householdMembers)
      .values({ householdId: id, userId: "m", role: "member" });
    await db.insert(householdKeyWraps).values({
      householdId: id,
      userId: "o",
      wrappedKey: "W",
      wrappedBy: "o",
    });
    return id;
  }

  it("lists members with their wrap state, owner first", async () => {
    const id = await seeded();
    expect(await listMembers(id)).toEqual([
      { userId: "o", name: "o", email: "o@example.com", role: "owner", hasWrap: true },
      { userId: "m", name: "m", email: "m@example.com", role: "member", hasWrap: false },
    ]);
  });

  it("owner removes a member and their wrap", async () => {
    const id = await seeded();
    await db.insert(householdKeyWraps).values({
      householdId: id,
      userId: "m",
      wrappedKey: "W2",
      wrappedBy: "o",
    });
    await removeMember(id, "o", "m");
    expect((await listMembers(id)).map((m) => m.userId)).toEqual(["o"]);
    expect(
      await db.select().from(householdKeyWraps).where(eq(householdKeyWraps.userId, "m"))
    ).toHaveLength(0);
  });

  it("a member cannot remove anyone (403)", async () => {
    const id = await seeded();
    await expect(removeMember(id, "m", "o")).rejects.toMatchObject({ status: 403 });
  });

  it("the owner cannot remove themselves (400)", async () => {
    const id = await seeded();
    await expect(removeMember(id, "o", "o")).rejects.toMatchObject({ status: 400 });
  });

  it("removing a non-member is 404", async () => {
    const id = await seeded();
    await expect(removeMember(id, "o", "x")).rejects.toBeInstanceOf(HouseholdError);
    await expect(removeMember(id, "o", "x")).rejects.toMatchObject({ status: 404 });
  });

  it("an outsider acting as owner is rejected by the membership check", async () => {
    const id = await seeded();
    await expect(removeMember(id, "x", "m")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
