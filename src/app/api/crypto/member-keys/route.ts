import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { changePassphraseSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { replaceMemberKeys } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function PUT(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const body = await parseBody(req, changePassphraseSchema);
    await replaceMemberKeys(userId, body);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:member-keys");
  }
}
