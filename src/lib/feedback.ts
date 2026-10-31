import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { emailEnabled, sendEmail } from "@/lib/email";
import { feedbackEmail, safeName } from "@/lib/email-templates";
import { displayName } from "@/lib/display-name";
export { FEEDBACK_MAX_LENGTH } from "@/lib/feedback-limits";

// Feedback from the app (#476), emailed to the owner and never stored.
//
// FEEDBACK_EMAIL is where it goes. With it unset, or email off, there is no
// "Send feedback" in the menu and the route answers 404: a self-hoster has no
// one to send it to.
//
// Anonymous means the email says nothing about the sender: no name, no
// address, no household, no page. The server knows who is signed in while it
// sends, because the route requires a member, and keeps nothing. The only
// table is a site-wide count per UTC day that caps the sends, which holds no
// one's identity either.
export const FEEDBACK_PER_DAY = 100;

export function feedbackAddress(): string | null {
  return process.env.FEEDBACK_EMAIL?.trim() || null;
}

export function feedbackEnabled(): boolean {
  return feedbackAddress() !== null && emailEnabled();
}

// One statement, so two sends at 99 of 100 cannot both pass.
async function claimDailySlot(now: Date): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const rows = await db.all<{ count: number }>(sql`
    INSERT INTO feedback_days (day, count) VALUES (${day}, 1)
    ON CONFLICT (day) DO UPDATE SET count = count + 1 WHERE count < ${FEEDBACK_PER_DAY}
    RETURNING count
  `);
  return rows.length > 0;
}

export async function sendFeedback(input: {
  userId: string;
  message: string;
  anonymous: boolean;
  version: string;
  locale: string;
  now?: Date;
}): Promise<"sent" | "failed"> {
  const to = feedbackAddress();
  if (!to || !emailEnabled()) throw new ApiError("Not found", 404);
  if (!(await claimDailySlot(input.now ?? new Date()))) {
    throw new ApiError("Too much feedback today. Please try again tomorrow.", 429);
  }

  let from: { name: string; email: string } | null = null;
  if (!input.anonymous) {
    const [user] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, input.userId));
    if (user) from = { name: safeName(displayName(user.name, user.email)), email: user.email };
  }

  const result = await sendEmail({
    to,
    ...feedbackEmail({ message: input.message, from, version: input.version, locale: input.locale }),
    idempotencyKey: `feedback/${crypto.randomUUID()}`,
    ...(from ? { replyTo: from.email } : {}),
  });
  return result.sent ? "sent" : "failed";
}
