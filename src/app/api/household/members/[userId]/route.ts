import { NextResponse } from "next/server";
import { z } from "zod";
import { unstable_update } from "@/auth";
import { resolveLocale } from "@/i18n/request";
import { apiErrorResponse, parseBody } from "@/lib/api-route";
import { removeMember, setMemberRole } from "@/lib/household";
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
    const emailed = await sendMemberRemovedEmail(target, userId, await resolveLocale());
    return NextResponse.json({ emailed });
  } catch (e) {
    return apiErrorResponse(e, "household:members:DELETE");
  }
}

const roleSchema = z.object({ role: z.enum(["owner", "member"]) });

// Promote or demote (#192). setMemberRole re-checks the caller's role against
// the database and keeps at least one owner. Changing your own role refreshes
// your session, as leaving does; anyone else's token keeps its old role until
// it is re-issued, which nothing that matters reads (the routes check the
// database, the shared layout reads the role from it).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { householdId, userId } = await requireHousehold();
    const target = (await params).userId;
    const { role } = await parseBody(req, roleSchema);
    await setMemberRole(householdId, userId, target, role);
    if (target === userId) await unstable_update({});
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "household:members:PATCH");
  }
}
