import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { ApiError } from "@/lib/api-error";
import { creditsEnabled } from "@/lib/billing";
import { CODE_NOT_VALID, redeemCreditCode } from "@/lib/credit-codes";
import { ForbiddenError, UnauthorizedError } from "@/lib/household";
import { scrubbedErrorLine } from "@/lib/log-scrub";

const Body = z.object({ code: z.string().max(100) });

// Redeems a credit code for the caller's household (#492). Any member may:
// credits are one shared pool (#294). Answers the credits added, or a fixed
// message that never repeats the code; the code is never logged.
export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    // Nothing to top up where credits are not counted (a self-hosted copy).
    if (!creditsEnabled()) throw new ApiError("Credits are not enabled", 404);

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(CODE_NOT_VALID, 400);

    const credits = await redeemCreditCode(householdId, parsed.data.code);
    return NextResponse.json({ credits });
  } catch (e) {
    if (e instanceof ApiError || e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return apiErrorResponse(e, "billing:redeem");
    }
    // A failed query's error carries its parameters, the code among them:
    // log the class only, never the error itself.
    console.error(`[billing:redeem] ${scrubbedErrorLine(e)}`);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
