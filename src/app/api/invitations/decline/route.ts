import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/auth";
import { apiErrorResponse } from "@/lib/api-route";
import { UnauthorizedError } from "@/lib/household";
import { startOwnHousehold } from "@/lib/invitations";

export async function POST() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedError();
    const householdId = await startOwnHousehold(userId);
    await unstable_update({});
    return NextResponse.json({ householdId });
  } catch (e) {
    return apiErrorResponse(e, "invitations:decline");
  }
}
