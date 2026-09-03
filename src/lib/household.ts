import { db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

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

export type Role = "owner" | "member";

export async function resolveHouseholdForUser(
  userId: string
): Promise<number> {
  const existing = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0].householdId;

  const [created] = await db
    .insert(households)
    .values({ name: "My household", ownerId: userId })
    .returning();

  await db
    .insert(householdMembers)
    .values({ householdId: created.id, userId, role: "owner" });

  return created.id;
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
