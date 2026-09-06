import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/auth";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse } from "@/lib/api-route";
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
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ApiError("Invalid invitation id", 400);
    const householdId = await acceptInvitation(id, userId);
    // Rewrites the JWT cookie in this response (jwt callback, trigger "update").
    await unstable_update({});
    return NextResponse.json({ householdId });
  } catch (e) {
    return apiErrorResponse(e, "invitations:accept");
  }
}
