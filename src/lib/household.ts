import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, gt, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";

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
}

export async function createHouseholdForUser(userId: string): Promise<number> {
  const [created] = await db
    .insert(households)
    .values({ name: "My household", ownerId: userId })
    .returning();

  await db
    .insert(householdMembers)
    .values({ householdId: created.id, userId, role: "owner" });

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
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
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
  }));
}

// Owner-only, checked against the database. Deletes the membership and the
// member's wrap; their JWT keeps working for up to 24h (documented limit).
export async function removeMember(
  householdId: number,
  actorUserId: string,
  targetUserId: string
): Promise<void> {
  const actorRole = await assertMembership(householdId, actorUserId);
  if (actorRole !== "owner") {
    throw new HouseholdError("Only the owner can remove members", 403);
  }
  if (actorUserId === targetUserId) {
    throw new HouseholdError("The owner cannot remove themselves", 400);
  }

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, targetUserId)
        )
      )
      .returning({ userId: householdMembers.userId });
    if (deleted.length === 0) {
      throw new HouseholdError("Not a member", 404);
    }
    await tx
      .delete(householdKeyWraps)
      .where(
        and(
          eq(householdKeyWraps.householdId, householdId),
          eq(householdKeyWraps.userId, targetUserId)
        )
      );
  });
}
