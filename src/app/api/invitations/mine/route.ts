import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiErrorResponse } from "@/lib/api-route";
import { UnauthorizedError } from "@/lib/household";
import { pendingInvitationsForUser } from "@/lib/invitations";

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedError();
    return NextResponse.json({ invitations: await pendingInvitationsForUser(userId) });
  } catch (e) {
    return apiErrorResponse(e, "invitations:mine");
  }
}
