import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { assertMembership, listMembers } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  try {
    const { householdId, userId } = await requireHousehold();
    const role = await assertMembership(householdId, userId);
    const members = await listMembers(householdId);
    return NextResponse.json({ members, me: { userId, role } });
  } catch (e) {
    return apiErrorResponse(e, "household:members");
  }
}
