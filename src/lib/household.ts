import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import { grantBetaPassCredits } from "@/lib/beta-pass";
import { displayName } from "@/lib/display-name";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Not a member of this household");
  }
}

export class HouseholdError extends ApiError {
  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message, status);
    this.name = "HouseholdError";
  }
}

export type Role = "owner" | "member";

export interface MemberSummary {
  userId: string;
  name: string | null;
  email: string;
  role: Role;
  hasWrap: boolean;
  // SPKI base64, or null before the member has set up encryption. Shown as a
  // fingerprint on the Household page so members can compare it out of band
  // (#218); the server's copy is exactly what such a comparison checks.
  publicKey: string | null;
}

export async function createHouseholdForUser(userId: string): Promise<number> {
  const [created] = await db
    .insert(households)
    .values({ name: "My household", ownerId: userId })
    .returning();

  await db
    .insert(householdMembers)
    .values({ householdId: created.id, userId, role: "owner" });

  // A beta tester's free credits land here, on their first own household
  // (#240). No-op for everyone else; exactly once for them.
  await grantBetaPassCredits(userId, created.id);

  return created.id;
}

// Returns the user's household, creating one on first sign-in — unless a
// pending invitation is waiting for their email, in which case it returns
// null so the sign-in flow can send them to /invitations to choose.
export async function resolveHouseholdForUser(
  userId: string
): Promise<number | null> {
  const existing = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0].householdId;

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user) {
    const pending = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, user.email.trim().toLowerCase()),
          eq(invitations.status, "pending"),
          gt(invitations.expiresAt, new Date())
        )
      )
      .limit(1);
    if (pending.length > 0) return null;
  }

  return createHouseholdForUser(userId);
}

// Reads the database rather than trusting the JWT. Call this from every
// destructive or membership-changing operation: a JWT stays valid for up to
// its 24h lifetime, so a removed member's token still carries a householdId.
export async function assertMembership(
  householdId: number,
  userId: string
): Promise<Role> {
  const rows = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId)
      )
    )
    .limit(1);

  if (rows.length === 0) throw new ForbiddenError();
  return rows[0].role as Role;
}

export async function listMembers(householdId: number): Promise<MemberSummary[]> {
  const rows = await db
    .select({
      userId: householdMembers.userId,
      name: users.name,
      email: users.email,
      role: householdMembers.role,
      wrapUserId: householdKeyWraps.userId,
      publicKey: memberKeys.publicKey,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .leftJoin(memberKeys, eq(memberKeys.userId, householdMembers.userId))
    .leftJoin(
      householdKeyWraps,
      and(
        eq(householdKeyWraps.householdId, householdMembers.householdId),
        eq(householdKeyWraps.userId, householdMembers.userId)
      )
    )
    .where(eq(householdMembers.householdId, householdId))
    // Owner first regardless of createdAt ties (unixepoch() has 1s
    // resolution, and owner/member rows in a test can land in the same
    // second), then chronological join order among the rest.
    .orderBy(
      sql`case when ${householdMembers.role} = 'owner' then 0 else 1 end`,
      householdMembers.createdAt
    );

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    hasWrap: r.wrapUserId !== null,
    publicKey: r.publicKey,
  }));
}

// Co-owners (#192): every owner may invite, remove, rotate and change roles,
// and a household keeps at least one. The guards below are conditions inside
// the one statement that makes the change, not a count read beforehand, so
// two owners demoting or removing each other at the same moment leave
// exactly one owner rather than none.
function moreThanOneOwner(householdId: number) {
  return sql`(select count(*) from household_members where household_id = ${householdId} and role = 'owner') > 1`;
}

function isOwner(householdId: number, userId: string) {
  return sql`exists (select 1 from household_members where household_id = ${householdId} and user_id = ${userId} and role = 'owner')`;
}

const LAST_OWNER = "The household must keep at least one owner";

// Self-service leave (#220). An owner may leave too, while another owner
// remains (#192). Deletes the membership and the wrap and marks the household
// rotation-due — the leaver's device still holds the data key, and the
// owners are warned until one of them rotates it (#219).
export async function leaveHousehold(householdId: number, userId: string): Promise<void> {
  await assertMembership(householdId, userId);
  await db.transaction(async (tx) => {
    const left = await tx
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
          or(eq(householdMembers.role, "member"), moreThanOneOwner(householdId))
        )
      )
      .returning({ userId: householdMembers.userId });
    if (left.length === 0) {
      throw new HouseholdError("The last owner cannot leave the household", 400);
    }
    await tx
      .delete(householdKeyWraps)
      .where(
        and(eq(householdKeyWraps.householdId, householdId), eq(householdKeyWraps.userId, userId))
      );
    await tx
      .update(households)
      .set({ rotationDue: true })
      .where(eq(households.id, householdId));
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function memberRole(tx: Tx, householdId: number, userId: string): Promise<Role | null> {
  const [row] = await tx
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
  return (row?.role as Role | undefined) ?? null;
}

// Owners only, checked against the database. Deletes the membership and the
// member's wrap; their JWT keeps working for up to 24h (documented limit).
// Another owner may be removed while one remains; yourself, never — that is
// leaving.
export async function removeMember(
  householdId: number,
  actorUserId: string,
  targetUserId: string
): Promise<void> {
  const actorRole = await assertMembership(householdId, actorUserId);
  if (actorRole !== "owner") {
    throw new HouseholdError("Only an owner can remove members", 403);
  }
  if (actorUserId === targetUserId) {
    throw new HouseholdError("You cannot remove yourself", 400);
  }

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, targetUserId),
          isOwner(householdId, actorUserId),
          or(eq(householdMembers.role, "member"), moreThanOneOwner(householdId))
        )
      )
      .returning({ userId: householdMembers.userId });
    if (deleted.length === 0) {
      if ((await memberRole(tx, householdId, targetUserId)) === null) {
        throw new HouseholdError("Not a member", 404);
      }
      if ((await memberRole(tx, householdId, actorUserId)) !== "owner") {
        throw new HouseholdError("Only an owner can remove members", 403);
      }
      throw new HouseholdError(LAST_OWNER, 409);
    }
    await tx
      .delete(householdKeyWraps)
      .where(
        and(
          eq(householdKeyWraps.householdId, householdId),
          eq(householdKeyWraps.userId, targetUserId)
        )
      );
    // The removed member's device still holds the data key. Rotation (#219)
    // is a client-side job an owner runs next; this flag is how the owners
    // are warned if it did not land, and it is cleared when it does.
    await tx
      .update(households)
      .set({ rotationDue: true })
      .where(eq(households.id, householdId));
  });
}

// Promote or demote (#192). Owners only; an owner may demote themselves or
// another owner while one remains. Setting the role someone already has is a
// no-op. Promotion clears the new owner's recovery-kit acknowledgement, so
// they are told who made the current kit.
export async function setMemberRole(
  householdId: number,
  actorUserId: string,
  targetUserId: string,
  role: Role
): Promise<void> {
  const actorRole = await assertMembership(householdId, actorUserId);
  if (actorRole !== "owner") {
    throw new HouseholdError("Only an owner can change roles", 403);
  }
  // A transaction although it is one guarded statement: it runs beside the
  // leave and removal transactions, and only db.transaction waits out a
  // SQLITE_BUSY on the local file (#225); a bare statement would fail.
  await db.transaction(async (tx) => {
    const target = and(
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.userId, targetUserId),
      isOwner(householdId, actorUserId)
    );
    const changed =
      role === "owner"
        ? await tx
            .update(householdMembers)
            .set({ role: "owner", recoveryKitSeenAt: null })
            .where(and(target, eq(householdMembers.role, "member")))
            .returning({ userId: householdMembers.userId })
        : await tx
            .update(householdMembers)
            .set({ role: "member" })
            .where(and(target, eq(householdMembers.role, "owner"), moreThanOneOwner(householdId)))
            .returning({ userId: householdMembers.userId });
    if (changed.length > 0) return;

    const current = await memberRole(tx, householdId, targetUserId);
    if (current === null) throw new HouseholdError("Not a member", 404);
    if (current === role) return;
    // The guard refused: either the actor stopped being an owner a moment
    // ago, or this would have left the household without one.
    if ((await memberRole(tx, householdId, actorUserId)) !== "owner") {
      throw new HouseholdError("Only an owner can change roles", 403);
    }
    throw new HouseholdError(LAST_OWNER, 409);
  });
}

// "The recovery kit was replaced" (#192). There is one kit per household, so
// a kit made by anyone — an owner regenerating or rotating, a member
// recovering — invalidates every other copy. Each other owner is told who
// made it and when, until they dismiss it. Null for members, for the kit's
// own author, for kits made before migration 0024, and once dismissed.
export interface RecoveryNotice {
  by: string | null;
  at: Date;
}

export async function recoveryNoticeFor(
  householdId: number,
  userId: string
): Promise<RecoveryNotice | null> {
  const [row] = await db
    .select({
      by: households.recoveryCreatedBy,
      at: households.recoveryCreatedAt,
      role: householdMembers.role,
      seenAt: householdMembers.recoveryKitSeenAt,
    })
    .from(households)
    .innerJoin(householdMembers, eq(householdMembers.householdId, households.id))
    .where(and(eq(households.id, householdId), eq(householdMembers.userId, userId)));
  if (!row || row.role !== "owner" || !row.by || !row.at || row.by === userId) return null;
  if (row.seenAt && row.seenAt.getTime() >= row.at.getTime()) return null;

  const [author] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, row.by));
  return { by: author ? displayName(author.name, author.email) : null, at: row.at };
}

export async function dismissRecoveryNotice(householdId: number, userId: string): Promise<void> {
  await db
    .update(householdMembers)
    .set({ recoveryKitSeenAt: new Date() })
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
}
