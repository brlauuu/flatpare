import { NextResponse } from "next/server";
import { unstable_update } from "@/auth";
import { apiErrorResponse } from "@/lib/api-route";
import { leaveHousehold } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

// Self-service leave (#220): a member deletes their own membership and wrap.
// The owner cannot leave — a household without an owner has nobody who can
// invite, remove or rotate. leaveHousehold marks the household as rotation
// due, since the leaver's device still holds the data key (#219).
//
// The JWT still names the old household, so the session is refreshed here
// (jwt callback, trigger "update"); with no membership and no pending
// invitation that gives the leaver a fresh household of their own, exactly
// as a first sign-in would. The client then does a full navigation so the
// proxy reads the new cookie.
export async function POST() {
  try {
    const { householdId, userId } = await requireHousehold();
    await leaveHousehold(householdId, userId);
    await unstable_update({});
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "household:leave");
  }
}
