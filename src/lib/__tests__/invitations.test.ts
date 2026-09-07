import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  apartments,
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  locationsOfInterest,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import { createHouseholdForUser, assertMembership } from "../household";
import {
  INVITATION_TTL_MS,
  acceptInvitation,
  createInvitation,
  listInvitations,
  normalizeEmail,
  pendingInvitationsForUser,
  revokeInvitation,
  startOwnHousehold,
} from "../invitations";

beforeEach(async () => {
  await db.delete(apartments);
  await db.delete(locationsOfInterest);
  await db.delete(invitations);
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeUser(id: string, email = `${id}@example.com`) {
  await db.insert(users).values({ id, email, name: id });
}

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });
});

describe("createInvitation / listInvitations / revokeInvitation", () => {
  it("creates a pending invitation that expires in 7 days", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    const before = Date.now();
    const inv = await createInvitation(hid, "o", " Ana@Example.com ");
    expect(inv.email).toBe("ana@example.com");
    expect(inv.status).toBe("pending");
    expect(inv.expiresAt.getTime()).toBeGreaterThanOrEqual(before + INVITATION_TTL_MS - 2000);
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(await listInvitations(hid)).toHaveLength(1);
  });

  it("rejects an invalid email (400)", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    await expect(createInvitation(hid, "o", "nope")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an existing member (409)", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    await expect(createInvitation(hid, "o", "O@example.com")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects a duplicate pending invitation (409) but allows one after revoke", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    const first = await createInvitation(hid, "o", "ana@example.com");
    await expect(createInvitation(hid, "o", "ANA@example.com")).rejects.toMatchObject({
      status: 409,
    });
    await revokeInvitation(hid, first.id);
    expect(await listInvitations(hid)).toHaveLength(0);
    await createInvitation(hid, "o", "ana@example.com");
    expect(await listInvitations(hid)).toHaveLength(1);
  });

  it("lazily marks expired invitations and hides them", async () => {
    await makeUser("o");
    const hid = await createHouseholdForUser("o");
    await db.insert(invitations).values({
      householdId: hid,
      email: "old@example.com",
      invitedBy: "o",
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await listInvitations(hid)).toHaveLength(0);
    const [row] = await db.select().from(invitations);
    expect(row.status).toBe("expired");
  });

  it("revoke of another household's invitation is 404", async () => {
    await makeUser("o");
    await makeUser("p");
    const hid = await createHouseholdForUser("o");
    const other = await createHouseholdForUser("p");
    const inv = await createInvitation(hid, "o", "ana@example.com");
    await expect(revokeInvitation(other, inv.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("pendingInvitationsForUser", () => {
  it("returns pending, unexpired invitations for the user's email", async () => {
    await makeUser("o");
    await makeUser("ana", "Ana@Example.com");
    const hid = await createHouseholdForUser("o");
    const inv = await createInvitation(hid, "o", "ana@example.com");
    const list = await pendingInvitationsForUser("ana");
    expect(list).toEqual([
      {
        id: inv.id,
        householdName: "My household",
        invitedByName: "o",
        expiresAt: inv.expiresAt,
      },
    ]);
  });
});

describe("acceptInvitation", () => {
  it("joins a household-less user as a member and marks the invitation accepted", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const inv = await createInvitation(hid, "o", "ana@example.com");
    expect(await acceptInvitation(inv.id, "ana")).toBe(hid);
    expect(await assertMembership(hid, "ana")).toBe("member");
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("accepted");
    expect(row.acceptedBy).toBe("ana");
  });

  it("404 when not pending, 409 when expired, 403 on email mismatch", async () => {
    await makeUser("o");
    await makeUser("ana");
    await makeUser("bob");
    const hid = await createHouseholdForUser("o");
    const inv = await createInvitation(hid, "o", "ana@example.com");

    await expect(acceptInvitation(inv.id, "bob")).rejects.toMatchObject({ status: 403 });
    await expect(acceptInvitation(999999, "ana")).rejects.toMatchObject({ status: 404 });

    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(invitations.id, inv.id));
    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("expired");
  });

  it("abandons an empty solo household and deletes it", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const solo = await createHouseholdForUser("ana");
    await db.insert(householdKeyWraps).values({
      householdId: solo,
      userId: "ana",
      wrappedKey: "W",
      wrappedBy: "ana",
    });
    await db.insert(locationsOfInterest).values({
      householdId: solo,
      label: "Work",
      icon: "briefcase",
      address: "x",
      sortOrder: 0,
    });
    const inv = await createInvitation(hid, "o", "ana@example.com");

    expect(await acceptInvitation(inv.id, "ana")).toBe(hid);
    expect(await db.select().from(households).where(eq(households.id, solo))).toHaveLength(0);
    expect(
      await db.select().from(householdKeyWraps).where(eq(householdKeyWraps.householdId, solo))
    ).toHaveLength(0);
    expect(
      await db.select().from(locationsOfInterest).where(eq(locationsOfInterest.householdId, solo))
    ).toHaveLength(0);
    expect(await assertMembership(hid, "ana")).toBe("member");
  });

  it("refuses to abandon a household with apartments (409) and changes nothing", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const solo = await createHouseholdForUser("ana");
    await db.insert(apartments).values({ householdId: solo, name: "Flat" });
    const inv = await createInvitation(hid, "o", "ana@example.com");

    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
    expect(await assertMembership(solo, "ana")).toBe("owner");
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("pending");
  });

  it("refuses to abandon a household with other members (409)", async () => {
    await makeUser("o");
    await makeUser("ana");
    await makeUser("bob");
    const hid = await createHouseholdForUser("o");
    const shared = await createHouseholdForUser("ana");
    await db
      .insert(householdMembers)
      .values({ householdId: shared, userId: "bob", role: "member" });
    const inv = await createInvitation(hid, "o", "ana@example.com");
    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
  });

  it("accepting an invitation to your own household is 409", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    await db
      .insert(householdMembers)
      .values({ householdId: hid, userId: "ana", role: "member" });
    // Bypass createInvitation's member check to get a stale invitation row.
    const [inv] = await db
      .insert(invitations)
      .values({
        householdId: hid,
        email: "ana@example.com",
        invitedBy: "o",
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
  });

  it("a revoked invitation cannot be accepted, and stays revoked (409)", async () => {
    // Simulates the race the transaction's guarded terminal update closes:
    // the invitation is revoked between acceptInvitation's pre-checks and
    // its transaction, so the unconditional-update version of this code
    // would flip a revoked row back to "accepted".
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const inv = await createInvitation(hid, "o", "ana@example.com");
    await revokeInvitation(hid, inv.id);

    await expect(acceptInvitation(inv.id, "ana")).rejects.toMatchObject({ status: 409 });
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("revoked");
    expect(row.acceptedBy).toBeNull();
  });
});

describe("startOwnHousehold", () => {
  it("creates a household for a user without one", async () => {
    await makeUser("ana");
    const id = await startOwnHousehold("ana");
    expect(await assertMembership(id, "ana")).toBe("owner");
  });

  it("is 409 when the user already has a household", async () => {
    await makeUser("ana");
    await createHouseholdForUser("ana");
    await expect(startOwnHousehold("ana")).rejects.toMatchObject({ status: 409 });
  });
});
