import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { recoverySchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { replaceRecovery } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function PUT(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    const role = await assertMembership(householdId, userId);
    if (role !== "owner") {
      throw new ApiError("Only the owner can regenerate the recovery kit", 403);
    }
    const body = await parseBody(req, recoverySchema);
    await replaceRecovery(householdId, body);
    return NextResponse.json({});
  } catch (e) {
    return apiErrorResponse(e, "crypto:recovery");
  }
}
