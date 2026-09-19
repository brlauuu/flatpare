import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/auth";
import { apiErrorResponse, parseIdParam } from "@/lib/api-route";
import { UnauthorizedError } from "@/lib/household";
import { acceptInvitation } from "@/lib/invitations";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedError();
    const id = parseIdParam((await params).id, "invitation id");
    const householdId = await acceptInvitation(id, userId);
    // Rewrites the JWT cookie in this response (jwt callback, trigger "update").
    await unstable_update({});
    return NextResponse.json({ householdId });
  } catch (e) {
    return apiErrorResponse(e, "invitations:accept");
  }
}
