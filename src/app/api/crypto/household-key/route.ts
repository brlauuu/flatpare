import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { householdKeySchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { createHouseholdKey } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

// Creates the data key for a household that has none, by an owner who
// already has a key pair (#220): someone who left, or was removed from, a
// previous household and now owns a fresh one. First-time users go through
// /api/crypto/setup instead, which creates the key pair and the household
// key together.
export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireHousehold();
    requireEncryptionOn();
    const role = await assertMembership(householdId, userId);
    const body = await parseBody(req, householdKeySchema);
    await createHouseholdKey({ householdId, userId, role, ...body });
    return NextResponse.json({}, { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "crypto:household-key");
  }
}
