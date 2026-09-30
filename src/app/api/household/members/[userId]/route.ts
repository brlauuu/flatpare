import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { removeMember } from "@/lib/household";
import { sendMemberRemovedEmail } from "@/lib/household-email";
import { requireHousehold } from "@/lib/session";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { householdId, userId } = await requireHousehold();
    const target = (await params).userId;
    // removeMember re-checks the caller's role against the database.
    await removeMember(householdId, userId, target);
    // After the commit; the outcome is reported, never enforced (#298).
    const emailed = await sendMemberRemovedEmail(target, userId);
    return NextResponse.json({ emailed });
  } catch (e) {
    return apiErrorResponse(e, "household:members:DELETE");
  }
}
