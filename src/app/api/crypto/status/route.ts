import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-route";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { assertMembership } from "@/lib/household";
import { getCryptoStatus } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  try {
    const { householdId, userId } = await requireHousehold();
    const role = await assertMembership(householdId, userId);
    const status = await getCryptoStatus(householdId, userId, role);
    return NextResponse.json({ mode: readEncryptionMode(), ...status });
  } catch (e) {
    return apiErrorResponse(e, "crypto:status");
  }
}
