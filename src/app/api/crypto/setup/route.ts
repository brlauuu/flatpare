import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { setupSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { setupMemberKeys } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    const role = await assertMembership(householdId, userId);
    const body = await parseBody(req, setupSchema);
    await setupMemberKeys({ householdId, userId, role, ...body });
    return NextResponse.json({}, { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "crypto:setup");
  }
}
