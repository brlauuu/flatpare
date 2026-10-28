import { NextResponse } from "next/server";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { chargeRecompute } from "@/lib/billing";

// "Recompute all" on the Household page spends one credit for the whole run
// (#413), asked for here before the client measures every distance again.
// Adding or moving a location of interest measures distances too, and that
// stays free: it calls nothing here.
export async function POST() {
  try {
    const { householdId } = await requireMember();
    await chargeRecompute(householdId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e, "billing:recompute");
  }
}
