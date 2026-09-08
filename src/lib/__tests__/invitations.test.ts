import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  apartments,
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  locations,
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
  await db.delete(locations);
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
    await db.insert(locations).values({
      id: crypto.randomUUID(),
      householdId: solo,
      sortOrder: 0,
      envelope: "placeholder",
    });
    const inv = await createInvitation(hid, "o", "ana@example.com");

    expect(await acceptInvitation(inv.id, "ana")).toBe(hid);
    expect(await db.select().from(households).where(eq(households.id, solo))).toHaveLength(0);
    expect(
      await db.select().from(householdKeyWraps).where(eq(householdKeyWraps.householdId, solo))
    ).toHaveLength(0);
    expect(
      await db.select().from(locations).where(eq(locations.householdId, solo))
    ).toHaveLength(0);
    expect(await assertMembership(hid, "ana")).toBe("member");
  });

  it("refuses to abandon a household with apartments (409) and changes nothing", async () => {
    await makeUser("o");
    await makeUser("ana");
    const hid = await createHouseholdForUser("o");
    const solo = await createHouseholdForUser("ana");
    await db.insert(apartments).values({ id: crypto.randomUUID(), householdId: solo, envelope: "placeholder" });
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

// E5: MAX_MEMBERS. Enforced at BOTH moments on purpose — accept alone is the
// only correct place (it is when a member appears), but it lets an owner send
// invitations guaranteed to fail and pushes the error onto the invitee; send
// alone enforces nothing, since 4 members plus 10 pending is 14 members.
describe("MAX_MEMBERS (#187)", () => {
  const ORIGINAL = process.env.MAX_MEMBERS;

  beforeEach(() => {
    delete process.env.MAX_MEMBERS;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MAX_MEMBERS;
    else process.env.MAX_MEMBERS = ORIGINAL;
  });

  async function ownerHousehold() {
    await makeUser("o");
    return createHouseholdForUser("o");
  }

  // The self-hoster default, called out in #187 as a must-not-regress.
  it("allows unlimited invitations when MAX_MEMBERS is unset", async () => {
    const hid = await ownerHousehold();
    for (let i = 0; i < 12; i++) {
      await expect(createInvitation(hid, "o", `p${i}@example.com`)).resolves.toBeTruthy();
    }
    expect(await listInvitations(hid)).toHaveLength(12);
  });

  it("counts pending invitations against the cap at send time", async () => {
    const hid = await ownerHousehold();
    process.env.MAX_MEMBERS = "3"; // the owner plus two more
    await createInvitation(hid, "o", "a@example.com");
    await createInvitation(hid, "o", "b@example.com");
    await expect(createInvitation(hid, "o", "c@example.com")).rejects.toMatchObject({
      status: 409,
      message: "Member limit reached",
    });
  });

  it("counts existing members against the cap, not just invitations", async () => {
    const hid = await ownerHousehold();
    await makeUser("m");
    await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
    process.env.MAX_MEMBERS = "2"; // both slots already taken
    await expect(createInvitation(hid, "o", "a@example.com")).rejects.toMatchObject({
      status: 409,
      message: "Member limit reached",
    });
  });

  it("frees a slot when a pending invitation is revoked", async () => {
    const hid = await ownerHousehold();
    process.env.MAX_MEMBERS = "2";
    const inv = await createInvitation(hid, "o", "a@example.com");
    await expect(createInvitation(hid, "o", "b@example.com")).rejects.toMatchObject({
      status: 409,
    });
    await revokeInvitation(hid, inv.id);
    await expect(createInvitation(hid, "o", "b@example.com")).resolves.toBeTruthy();
  });

  it("does not count an expired invitation against the cap", async () => {
    const hid = await ownerHousehold();
    const inv = await createInvitation(hid, "o", "a@example.com");
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, inv.id));
    process.env.MAX_MEMBERS = "2";
    // expireStale runs first, so the stale row must not occupy the slot.
    await expect(createInvitation(hid, "o", "b@example.com")).resolves.toBeTruthy();
  });

  it("refuses an accept that would exceed the cap, even though the send passed", async () => {
    const hid = await ownerHousehold();
    await makeUser("a");
    await makeUser("b");
    const invA = await createInvitation(hid, "o", "a@example.com");
    const invB = await createInvitation(hid, "o", "b@example.com");

    await acceptInvitation(invA.id, "a"); // owner + a = 2 members
    process.env.MAX_MEMBERS = "2";

    await expect(acceptInvitation(invB.id, "b")).rejects.toMatchObject({
      status: 409,
      message: "Member limit reached",
    });
  });

  it("leaves the invitation pending when an accept is refused by the cap", async () => {
    const hid = await ownerHousehold();
    await makeUser("a");
    const inv = await createInvitation(hid, "o", "a@example.com");
    process.env.MAX_MEMBERS = "1"; // the owner already fills it

    await expect(acceptInvitation(inv.id, "a")).rejects.toMatchObject({ status: 409 });

    // The invitee must be able to retry once a slot frees, so the row must
    // NOT have been flipped to accepted, and no membership written.
    const [row] = await db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row.status).toBe("pending");
    expect(row.acceptedBy).toBeNull();
    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, hid));
    expect(members).toHaveLength(1);
  });

  it("lets the accept through once a slot frees", async () => {
    const hid = await ownerHousehold();
    await makeUser("a");
    const inv = await createInvitation(hid, "o", "a@example.com");
    process.env.MAX_MEMBERS = "1";
    await expect(acceptInvitation(inv.id, "a")).rejects.toMatchObject({ status: 409 });

    process.env.MAX_MEMBERS = "2";
    await expect(acceptInvitation(inv.id, "a")).resolves.toBe(hid);
    expect(await assertMembership(hid, "a")).toBe("member");
  });

  it("allows an accept with no cap configured", async () => {
    const hid = await ownerHousehold();
    await makeUser("a");
    const inv = await createInvitation(hid, "o", "a@example.com");
    await expect(acceptInvitation(inv.id, "a")).resolves.toBe(hid);
  });
});
