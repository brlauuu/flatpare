import { NextResponse } from "next/server";
import { apiErrorResponse, requireEncryptionOn } from "@/lib/api-route";
import { assertMembership } from "@/lib/household";
import { listPendingWraps } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    await assertMembership(householdId, userId);
    return NextResponse.json({ pending: await listPendingWraps(householdId) });
  } catch (e) {
    return apiErrorResponse(e, "crypto:pending-wraps");
  }
}
