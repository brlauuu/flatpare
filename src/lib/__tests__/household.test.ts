import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  betaPasses,
  betaPassRedemptions,
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq } from "drizzle-orm";
import {
  resolveHouseholdForUser,
  createHouseholdForUser,
  assertMembership,
  leaveHousehold,
  listMembers,
  removeMember,
  setMemberRole,
  recoveryNoticeFor,
  dismissRecoveryNotice,
  ForbiddenError,
  HouseholdError,
} from "../household";

beforeEach(async () => {
  await db.delete(betaPassRedemptions);
  await db.delete(betaPasses);
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

  async function grantedOn(householdId: number): Promise<number> {
    const [row] = await db
      .select({ granted: households.apartmentCreditsGranted })
      .from(households)
      .where(eq(households.id, householdId));
    return row.granted;
  }

  // #240: the beta pass that admitted the user pays out here, on their own
  // first household — the same place a first sign-in lands (resolveHousehold
  // ForUser) and where declining every invitation lands (invitations.ts).
  it("grants a beta tester the credits their pass promised", async () => {
    await makeUser("tester");
    const [pass] = await db
      .insert(betaPasses)
      .values({ code: "c".repeat(32), credits: 40 })
      .returning();
    await db.insert(betaPassRedemptions).values({ passId: pass.id, userId: "tester" });

    const id = await createHouseholdForUser("tester");
    expect(await grantedOn(id)).toBe(40);
  });

  it("grants nothing to a user who did not come in through a pass", async () => {
    await makeUser("u1");
    const id = await createHouseholdForUser("u1");
    expect(await grantedOn(id)).toBe(0);
  });

  // An invited joiner lands in someone else's household, which already has
  // its credits or is paying: nothing is granted to it on their account.
  it("does not grant on joining an existing household by invitation", async () => {
    await makeUser("owner");
    await makeUser("tester");
    const [pass] = await db
      .insert(betaPasses)
      .values({ code: "d".repeat(32), credits: 40 })
      .returning();
    await db.insert(betaPassRedemptions).values({ passId: pass.id, userId: "tester" });
    const ownerHousehold = await createHouseholdForUser("owner");
    await db.insert(householdMembers).values({
      householdId: ownerHousehold,
      userId: "tester",
      role: "member",
    });

    expect(await resolveHouseholdForUser("tester")).toBe(ownerHousehold);
    expect(await grantedOn(ownerHousehold)).toBe(0);
    const [redemption] = await db.select().from(betaPassRedemptions);
    expect(redemption.grantedAt).toBeNull();
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
      { userId: "o", name: "o", email: "o@example.com", role: "owner", hasWrap: true, publicKey: null },
      { userId: "m", name: "m", email: "m@example.com", role: "member", hasWrap: false, publicKey: null },
    ]);
  });

  it("carries each member's public key once they have set up encryption (#218)", async () => {
    const id = await seeded();
    await db.insert(memberKeys).values({
      userId: "m",
      publicKey: "PUB-m",
      wrappedPrivateKey: "WPK",
      privateKeyIv: "IV",
      kdfSalt: "S",
      kdfMemoryKib: 1024,
      kdfIterations: 1,
      kdfParallelism: 1,
      kdfVersion: 1,
    });
    const members = await listMembers(id);
    expect(members.map((m) => [m.userId, m.publicKey])).toEqual([
      ["o", null],
      ["m", "PUB-m"],
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

// #219: removal flags the household so the owner is warned until the data
// key is rotated. Rotation itself is client-side and tested elsewhere.
describe("removeMember marks rotation due", () => {
  it("sets rotation_due and leaves it for the rotation to clear", async () => {
    await makeUser("owner");
    await makeUser("m");
    const id = await createHouseholdForUser("owner");
    await db.insert(householdMembers).values({ householdId: id, userId: "m", role: "member" });
    const before = await db.select({ due: households.rotationDue }).from(households).where(eq(households.id, id));
    expect(before[0].due).toBe(false);

    await removeMember(id, "owner", "m");

    const after = await db.select({ due: households.rotationDue }).from(households).where(eq(households.id, id));
    expect(after[0].due).toBe(true);
  });
});

// #220
describe("leaveHousehold", () => {
  async function seeded() {
    await makeUser("owner");
    await makeUser("m");
    const id = await createHouseholdForUser("owner");
    await db.insert(householdMembers).values({ householdId: id, userId: "m", role: "member" });
    await db.insert(householdKeyWraps).values({ householdId: id, userId: "m", wrappedKey: "W", wrappedBy: "owner" });
    return id;
  }

  it("removes the member's membership and wrap and marks rotation due", async () => {
    const id = await seeded();
    await leaveHousehold(id, "m");
    await expect(assertMembership(id, "m")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(householdKeyWraps).where(eq(householdKeyWraps.userId, "m"))).toHaveLength(0);
    const [h] = await db.select({ due: households.rotationDue }).from(households).where(eq(households.id, id));
    expect(h.due).toBe(true);
    // The owner is untouched.
    expect(await assertMembership(id, "owner")).toBe("owner");
  });

  it("refuses the last owner with 400 and changes nothing", async () => {
    const id = await seeded();
    await expect(leaveHousehold(id, "owner")).rejects.toMatchObject({ status: 400, message: /last owner cannot leave/ });
    expect(await assertMembership(id, "owner")).toBe("owner");
    const [h] = await db.select({ due: households.rotationDue }).from(households).where(eq(households.id, id));
    expect(h.due).toBe(false);
  });

  it("refuses a non-member", async () => {
    const id = await seeded();
    await makeUser("x");
    await expect(leaveHousehold(id, "x")).rejects.toBeInstanceOf(ForbiddenError);
  });

  // After leaving, the next session refresh resolves a fresh household of
  // their own — the same path as a first sign-in.
  it("leaves the leaver with a fresh household on re-resolve", async () => {
    const id = await seeded();
    await leaveHousehold(id, "m");
    const fresh = await resolveHouseholdForUser("m");
    expect(fresh).not.toBeNull();
    expect(fresh).not.toBe(id);
    expect(await assertMembership(fresh!, "m")).toBe("owner");
  });
});

describe("co-owners (#192)", () => {
  // "a" owns; "b" and "c" are members. Every test starts from that.
  async function seeded() {
    for (const u of ["a", "b", "c", "x"]) await makeUser(u);
    const id = await createHouseholdForUser("a");
    for (const u of ["b", "c"]) {
      await db.insert(householdMembers).values({ householdId: id, userId: u, role: "member" });
    }
    return id;
  }

  async function owners(id: number) {
    const rows = await db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, id), eq(householdMembers.role, "owner")));
    return rows.map((r) => r.userId).sort();
  }

  describe("setMemberRole", () => {
    it("lets an owner promote a member, and the new owner has every owner right", async () => {
      const id = await seeded();
      await setMemberRole(id, "a", "b", "owner");
      expect(await owners(id)).toEqual(["a", "b"]);
      await setMemberRole(id, "b", "c", "owner");
      await removeMember(id, "b", "c");
      expect(await owners(id)).toEqual(["a", "b"]);
    });

    it("lets an owner demote another owner, or themselves, while one remains", async () => {
      const id = await seeded();
      await setMemberRole(id, "a", "b", "owner");
      await setMemberRole(id, "b", "a", "member");
      expect(await owners(id)).toEqual(["b"]);
      await setMemberRole(id, "b", "c", "owner");
      await setMemberRole(id, "c", "c", "member");
      expect(await owners(id)).toEqual(["b"]);
    });

    it("refuses to demote the last owner (409)", async () => {
      const id = await seeded();
      await expect(setMemberRole(id, "a", "a", "member")).rejects.toMatchObject({
        status: 409,
        message: /at least one owner/,
      });
      expect(await owners(id)).toEqual(["a"]);
    });

    it("refuses a member (403), a non-member actor, and an unknown target (404)", async () => {
      const id = await seeded();
      await expect(setMemberRole(id, "b", "c", "owner")).rejects.toMatchObject({ status: 403 });
      await expect(setMemberRole(id, "x", "b", "owner")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setMemberRole(id, "a", "x", "owner")).rejects.toMatchObject({ status: 404 });
      expect(await owners(id)).toEqual(["a"]);
    });

    it("treats the role someone already has as a no-op", async () => {
      const id = await seeded();
      await setMemberRole(id, "a", "a", "owner");
      await setMemberRole(id, "a", "b", "member");
      expect(await owners(id)).toEqual(["a"]);
    });
  });

  describe("leaving and removal", () => {
    it("lets an owner leave while another owner remains", async () => {
      const id = await seeded();
      await setMemberRole(id, "a", "b", "owner");
      await leaveHousehold(id, "a");
      expect(await owners(id)).toEqual(["b"]);
      await expect(leaveHousehold(id, "b")).rejects.toMatchObject({ status: 400 });
    });

    it("lets an owner remove another owner", async () => {
      const id = await seeded();
      await setMemberRole(id, "a", "b", "owner");
      await removeMember(id, "a", "b");
      expect(await owners(id)).toEqual(["a"]);
      await expect(assertMembership(id, "b")).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  // The guard is inside each statement, so owners acting against each other
  // at the same moment cannot leave the household with none.
  it("keeps exactly one owner when two owners demote, remove and leave against each other at once", async () => {
    for (let round = 0; round < 4; round++) {
      await db.delete(householdMembers);
      await db.delete(households);
      await db.delete(users);
      const id = await seeded();
      await setMemberRole(id, "a", "b", "owner");
      const results = await Promise.allSettled([
        setMemberRole(id, "a", "b", "member"),
        setMemberRole(id, "b", "a", "member"),
        removeMember(id, "a", "b"),
        removeMember(id, "b", "a"),
        leaveHousehold(id, "a"),
        leaveHousehold(id, "b"),
        setMemberRole(id, "a", "a", "member"),
        setMemberRole(id, "b", "b", "member"),
      ]);
      // Every refusal is an ownership rule, never the database giving up.
      for (const r of results) {
        if (r.status === "rejected") {
          expect(r.reason instanceof HouseholdError || r.reason instanceof ForbiddenError).toBe(true);
        }
      }
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      expect(await owners(id)).toHaveLength(1);
    }
  });

  describe("recovery kit notice", () => {
    async function kitBy(id: number, userId: string, at = new Date()) {
      await db
        .update(households)
        .set({ recoveryCreatedBy: userId, recoveryCreatedAt: at })
        .where(eq(households.id, id));
    }

    it("tells another owner who made the kit and when, until dismissed", async () => {
      const id = await seeded();
      await db.update(users).set({ name: "Alex" }).where(eq(users.id, "a"));
      await setMemberRole(id, "a", "b", "owner");
      const at = new Date(Math.floor(Date.now() / 1000) * 1000);
      await kitBy(id, "a", at);
      expect(await recoveryNoticeFor(id, "b")).toEqual({ by: "Alex", at });
      await dismissRecoveryNotice(id, "b");
      expect(await recoveryNoticeFor(id, "b")).toBeNull();
    });

    it("comes back when the kit is replaced again after dismissal", async () => {
      const id = await seeded();
      await setMemberRole(id, "a", "b", "owner");
      await kitBy(id, "a", new Date(Date.now() - 60_000));
      await dismissRecoveryNotice(id, "b");
      await kitBy(id, "c", new Date(Date.now() + 60_000));
      expect(await recoveryNoticeFor(id, "b")).toMatchObject({ by: "c" });
    });

    it("is not shown to the kit's author, to members, or for a kit with no recorded author", async () => {
      const id = await seeded();
      expect(await recoveryNoticeFor(id, "a")).toBeNull();
      await kitBy(id, "a");
      expect(await recoveryNoticeFor(id, "a")).toBeNull();
      expect(await recoveryNoticeFor(id, "b")).toBeNull();
    });

    it("is shown again to someone promoted after dismissing it as a former owner", async () => {
      const id = await seeded();
      await setMemberRole(id, "a", "b", "owner");
      await kitBy(id, "a", new Date(Date.now() - 60_000));
      await dismissRecoveryNotice(id, "b");
      await setMemberRole(id, "a", "b", "member");
      await setMemberRole(id, "a", "b", "owner");
      expect(await recoveryNoticeFor(id, "b")).not.toBeNull();
    });
  });
});
