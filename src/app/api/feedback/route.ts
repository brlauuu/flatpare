import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { resolveLocale } from "@/i18n/request";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { FEEDBACK_MAX_LENGTH, sendFeedback } from "@/lib/feedback";

// POST /api/feedback — "Send feedback" in the user menu (#476). Emailed to
// FEEDBACK_EMAIL and stored nowhere; see src/lib/feedback.ts for what an
// anonymous message leaves out.
//
// The message is a member's own words and never reaches a log: errors here
// go through apiErrorResponse under a `process:` tag, which logs the error's
// class and status only.

const schema = z.object({
  message: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
  anonymous: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const { userId } = await requireMember();
    const body = await parseBody(req, schema);
    const emailed = await sendFeedback({
      userId,
      message: body.message,
      anonymous: body.anonymous,
      version: process.env.FLATPARE_RELEASE_VERSION || "unknown",
      locale: await resolveLocale(),
    });
    return NextResponse.json({ emailed }, { status: emailed === "sent" ? 200 : 502 });
  } catch (err) {
    // Not apiErrorResponse's ZodError branch: its issues can carry the
    // message back.
    if (err instanceof ZodError) return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
    return apiErrorResponse(err, "process:feedback");
  }
}
