import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { checkListingUrl } from "@/lib/listing-status";
import { checkListingRequestSchema } from "@/lib/process-schemas";

// Privacy exception: the listing URL is plaintext so the server can probe
// it (browsers cannot, cross-origin). Not logged, nothing written.
export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    await consumeRateLimit(householdId, "check-listing");
    const { url } = await parseBody(req, checkListingRequestSchema);
    return NextResponse.json({ gone: await checkListingUrl(url) });
  } catch (e) {
    return apiErrorResponse(e, "process:check-listing");
  }
}
