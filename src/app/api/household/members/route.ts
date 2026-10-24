import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { assertMembership, listMembers, recoveryNoticeFor } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  try {
    const { householdId, userId } = await requireHousehold();
    const role = await assertMembership(householdId, userId);
    const [members, recoveryNotice] = await Promise.all([
      listMembers(householdId),
      recoveryNoticeFor(householdId, userId),
    ]);
    return NextResponse.json({ members, me: { userId, role }, recoveryNotice });
  } catch (e) {
    return apiErrorResponse(e, "household:members");
  }
}
