import { NextResponse } from "next/server";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { readCreditBalance } from "@/lib/billing";

// The household's credit balance. Read-only; the client uses it to show the
// remaining count and to notice when a purchase has landed — embedded
// Checkout never redirects, so the page polls this rather than trusting a
// completion callback it cannot verify.
export async function GET() {
  try {
    const { householdId } = await requireMember();
    return NextResponse.json(await readCreditBalance(householdId));
  } catch (e) {
    return apiErrorResponse(e, "billing:status");
  }
}
