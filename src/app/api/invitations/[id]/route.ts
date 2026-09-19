import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseIdParam } from "@/lib/api-route";
import { assertMembership } from "@/lib/household";
import { revokeInvitation } from "@/lib/invitations";
import { requireHousehold } from "@/lib/session";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { householdId, userId } = await requireHousehold();
    const role = await assertMembership(householdId, userId);
    if (role !== "owner") throw new ApiError("Only the owner can manage invitations", 403);
    const id = parseIdParam((await params).id, "invitation id");
    await revokeInvitation(householdId, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "invitations:DELETE");
  }
}
