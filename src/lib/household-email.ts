import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations, type Invitation } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { ApiError } from "@/lib/api-error";
import { emailEnabled, sendEmail } from "@/lib/email";
import { householdInvitationEmail, memberRemovedEmail } from "@/lib/email-templates";
import { SITE_URL } from "@/lib/site";

// How many invitations one household may create in 24 hours while email is
// on. Inviting sends mail to an address the owner typed, so without a ceiling
// an account could invite, revoke and invite again to mail strangers from our
// domain. MAX_MEMBERS does not bound that: a revoked invitation frees its
// slot. Ten members is the most a household holds, so this is generous.
export const INVITATIONS_PER_DAY = 20;

// Counts rows in every status: a revoked or expired invitation still sent an
// email. Not applied when email is off, where inviting mails nobody.
export async function assertInvitationBudget(householdId: number): Promise<void> {
  if (!emailEnabled()) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)` })
    .from(invitations)
    .where(and(eq(invitations.householdId, householdId), gt(invitations.createdAt, since)));
  if (Number(recent) >= INVITATIONS_PER_DAY) {
    throw new ApiError("Too many invitations today. Try again tomorrow.", 429);
  }
}

export type InvitationEmailOutcome = "sent" | "failed" | "off";

// Tells the invitee. The invitation already exists when this runs and is
// valid whether or not the email arrives, so this reports an outcome and
// never throws: a mail provider being down must not undo an invitation.
export async function sendInvitationEmail(
  invitation: Pick<Invitation, "id" | "email" | "expiresAt" | "invitedBy">
): Promise<InvitationEmailOutcome> {
  if (!emailEnabled()) return "off";

  const [inviter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, invitation.invitedBy))
    .limit(1);

  const rendered = householdInvitationEmail({
    inviterName: inviter?.name,
    invitedEmail: invitation.email,
    siteUrl: SITE_URL,
    expiresAt: invitation.expiresAt,
  });
  const result = await sendEmail({
    to: invitation.email,
    ...rendered,
    idempotencyKey: `household-invitation/${invitation.id}`,
  });
  return result.sent ? "sent" : result.reason;
}

// Tells a removed member (#298). Called after the removal has committed, so a
// mail failure cannot leave someone in who should be out; like the invitation
// email it reports and never throws. Names who did it and nothing about the
// household. The removed user's row still exists — only the membership went.
export async function sendMemberRemovedEmail(
  removedUserId: string,
  removedBy: string
): Promise<InvitationEmailOutcome> {
  if (!emailEnabled()) return "off";

  const [removed] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, removedUserId))
    .limit(1);
  if (!removed) return "failed";
  const [remover] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, removedBy))
    .limit(1);

  const rendered = memberRemovedEmail({ removerName: remover?.name, siteUrl: SITE_URL });
  const result = await sendEmail({
    to: removed.email,
    ...rendered,
    // One notice per removal: a member removed, re-invited and removed again
    // the same day gets a second one, which is right.
    idempotencyKey: `member-removed/${removedUserId}/${Date.now()}`,
  });
  return result.sent ? "sent" : result.reason;
}
