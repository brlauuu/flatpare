import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { wrapsSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { fulfilWraps } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const { wraps } = await parseBody(req, wrapsSchema);
    const fulfilled = await fulfilWraps(householdId, userId, wraps);
    return NextResponse.json({ fulfilled });
  } catch (e) {
    return apiErrorResponse(e, "crypto:wraps");
  }
}
