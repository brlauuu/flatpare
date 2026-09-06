import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse } from "@/lib/api-route";
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
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ApiError("Invalid invitation id", 400);
    await revokeInvitation(householdId, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "invitations:DELETE");
  }
}
