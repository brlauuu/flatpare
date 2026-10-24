import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { assertMembership, dismissRecoveryNotice } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

// Dismisses "the recovery kit was replaced" for the caller (#192). The notice
// itself travels with GET /api/household/members.
export async function POST() {
  try {
    const { householdId, userId } = await requireHousehold();
    await assertMembership(householdId, userId);
    await dismissRecoveryNotice(householdId, userId);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "household:recovery-notice");
  }
}
