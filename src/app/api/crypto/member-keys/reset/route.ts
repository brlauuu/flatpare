import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { memberKeySchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { resetMemberKeys } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const member = await parseBody(req, memberKeySchema);
    await resetMemberKeys(householdId, userId, member);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:member-keys:reset");
  }
}
