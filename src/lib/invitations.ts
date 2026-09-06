import { db } from "@/lib/db";
import {
  apartments,
  apartmentDistances,
  households,
  householdMembers,
  householdKeyWraps,
  invitations,
  locationsOfInterest,
  ratings,
  type Invitation,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import { createHouseholdForUser } from "@/lib/household";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class InvitationError extends ApiError {
  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message, status);
    this.name = "InvitationError";
  }
}

export interface PendingInvitationForUser {
  id: number;
  householdName: string;
  invitedByName: string | null;
  expiresAt: Date;
}

// Deliberately loose: one "@" with something either side. The real check is
// that the invitee signs in with a provider that vouches for the address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isUniqueConstraintError(e: unknown): boolean {
  let cur: unknown = e;
  while (cur && typeof cur === "object") {
    const message = (cur as { message?: unknown }).message;
    if (typeof message === "string" && /UNIQUE constraint failed/.test(message)) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

async function expireStale(householdId?: number): Promise<void> {
  const now = new Date();
  await db
    .update(invitations)
    .set({ status: "expired" })
    .where(
      and(
        eq(invitations.status, "pending"),
        lte(invitations.expiresAt, now),
        householdId === undefined ? undefined : eq(invitations.householdId, householdId)
      )
    );
}

export async function createInvitation(
  householdId: number,
  invitedBy: string,
  rawEmail: string
): Promise<Invitation> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) {
    throw new InvitationError("Enter a valid email address", 400);
  }

  const member = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(sql`lower(${users.email})`, email)
      )
    )
    .limit(1);
  if (member.length > 0) {
    throw new InvitationError("That person is already a member", 409);
  }

  await expireStale(householdId);
  try {
    const [created] = await db
      .insert(invitations)
      .values({
        householdId,
        email,
        invitedBy,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      })
      .returning();
    return created;
  } catch (e) {
    // The partial unique index invitations_pending_household_email. Drizzle
    // wraps the driver error, so walk the cause chain rather than matching
    // the top-level message.
    if (isUniqueConstraintError(e)) {
      throw new InvitationError("An invitation is already pending for that email", 409);
    }
    throw e;
  }
}

export async function listInvitations(householdId: number): Promise<Invitation[]> {
  await expireStale(householdId);
  return db
    .select()
    .from(invitations)
    .where(
      and(eq(invitations.householdId, householdId), eq(invitations.status, "pending"))
    )
    .orderBy(invitations.createdAt);
}

export async function revokeInvitation(householdId: number, id: number): Promise<void> {
  const updated = await db
    .update(invitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.householdId, householdId),
        eq(invitations.status, "pending")
      )
    )
    .returning({ id: invitations.id });
  if (updated.length === 0) throw new InvitationError("Invitation not found", 404);
}

export async function pendingInvitationsForUser(
  userId: string
): Promise<PendingInvitationForUser[]> {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return [];

  const inviter = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${invitations.invitedBy})`;
  return db
    .select({
      id: invitations.id,
      householdName: households.name,
      invitedByName: inviter,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(households, eq(households.id, invitations.householdId))
    .where(
      and(
        eq(invitations.email, normalizeEmail(user.email)),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date())
      )
    )
    .orderBy(invitations.createdAt);
}

// Accept: join the household as a member. If the user already belongs to a
// household, the abandon rule applies (Global Constraints): sole member and
// zero apartments → the old household is deleted; anything else is 409.
// Migration 0011 toggled foreign_keys, so the deletes are explicit rather
// than relying on ON DELETE CASCADE.
export async function acceptInvitation(id: number, userId: string): Promise<number> {
  // Fetched and (if applicable) expired outside any transaction: a thrown
  // error inside db.transaction rolls back everything the callback did,
  // which would undo the expiry write we need to persist alongside the 409.
  // Deliberately not filtered by status here — a row that is already
  // accepted/revoked still needs to reach the transaction's guarded update
  // below so a stale accept lands on the "no longer available" 409 rather
  // than a misleading 404.
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, id))
    .limit(1);
  if (!inv) throw new InvitationError("Invitation not found", 404);

  if (inv.status === "pending" && inv.expiresAt.getTime() <= Date.now()) {
    // Guarded on status too: only flip a row we know is still pending, so a
    // concurrent revoke/accept that already changed it isn't clobbered.
    const [expired] = await db
      .update(invitations)
      .set({ status: "expired" })
      .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
      .returning({ id: invitations.id });
    if (expired) throw new InvitationError("This invitation has expired", 409);
  }

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || normalizeEmail(user.email) !== inv.email) {
    throw new InvitationError("This invitation was sent to a different email", 403);
  }

  return db.transaction(async (tx) => {
    // Re-validated here, as the first statement in the transaction: the
    // pre-checks above ran outside any transaction, so a concurrent accept
    // or a revokeInvitation() racing this call could have already changed
    // the row's status. Only a still-pending row is claimed, and the
    // resulting householdId (not the pre-read one) drives everything below.
    const [accepted] = await tx
      .update(invitations)
      .set({ status: "accepted", acceptedBy: userId })
      .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
      .returning({ householdId: invitations.householdId });
    if (!accepted) {
      throw new InvitationError("This invitation is no longer available", 409);
    }

    const [current] = await tx
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId))
      .limit(1);

    if (current) {
      if (current.householdId === accepted.householdId) {
        throw new InvitationError("You are already a member of this household", 409);
      }
      const [{ members }] = await tx
        .select({ members: sql<number>`count(*)` })
        .from(householdMembers)
        .where(eq(householdMembers.householdId, current.householdId));
      const [{ flats }] = await tx
        .select({ flats: sql<number>`count(*)` })
        .from(apartments)
        .where(eq(apartments.householdId, current.householdId));
      if (Number(members) !== 1 || Number(flats) !== 0) {
        throw new InvitationError("You already belong to a household", 409);
      }
      const old = current.householdId;
      await tx.delete(apartmentDistances).where(eq(apartmentDistances.householdId, old));
      await tx.delete(ratings).where(eq(ratings.householdId, old));
      await tx.delete(locationsOfInterest).where(eq(locationsOfInterest.householdId, old));
      await tx.delete(invitations).where(eq(invitations.householdId, old));
      await tx.delete(householdKeyWraps).where(eq(householdKeyWraps.householdId, old));
      await tx.delete(householdMembers).where(eq(householdMembers.householdId, old));
      await tx.delete(households).where(eq(households.id, old));
    }

    await tx
      .insert(householdMembers)
      .values({ householdId: accepted.householdId, userId, role: "member" });

    return accepted.householdId;
  });
}

// "Start my own household instead" on /invitations. Pending invitations are
// left alone: the user may still accept one later under the abandon rule.
export async function startOwnHousehold(userId: string): Promise<number> {
  const existing = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    throw new InvitationError("You already have a household", 409);
  }
  return createHouseholdForUser(userId);
}
