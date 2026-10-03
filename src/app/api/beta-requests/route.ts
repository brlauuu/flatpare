import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody } from "@/lib/api-route";
import { scrubbedErrorLine } from "@/lib/log-scrub";
import { notifyOwnerOfBetaRequest, recordBetaRequest } from "@/lib/beta-requests";

// POST /api/beta-requests — the landing page's "Request a beta invite" form
// (#301). Public: the person asking has no account, so src/proxy.ts lets
// this one path through without a session.
//
// The reply is the same `{ ok: true }` for a new address, a repeat address
// and a tripped honeypot, so nothing here tells a caller who has asked
// before. The daily cap (429) is the one other answer.
//
// The address is personal data. It is stored (the owner must read it to
// answer) and mailed to the owner, and it never reaches a log: an unexpected
// error is logged by class only, never by message, which for a database
// error can quote the statement's arguments.

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // The honeypot. Hidden from people and from assistive technology, so only
  // a form-filling bot types into it.
  website: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    if (body.website) return NextResponse.json({ ok: true });

    const outcome = await recordBetaRequest(body.email);
    if (outcome.created) await notifyOwnerOfBetaRequest(outcome);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return apiErrorResponse(err, "beta-requests");
    if (err instanceof ZodError) {
      // Not apiErrorResponse's ZodError branch: its `issues` can carry the
      // rejected input back, and "that is not an email address" is all the
      // form needs.
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    console.error(`[beta-requests] ${scrubbedErrorLine(err)}`);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
