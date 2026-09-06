import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { recoverSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { recoverHousehold } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    const body = await parseBody(req, recoverSchema);
    await recoverHousehold(householdId, userId, body);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:recover");
  }
}
