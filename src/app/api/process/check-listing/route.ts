import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { checkListingUrl } from "@/lib/listing-status";
import { checkListingRequestSchema } from "@/lib/process-schemas";

// Privacy exception: the listing URL is plaintext so the server can probe
// it (browsers cannot, cross-origin). Not logged, nothing written.
export async function POST(req: Request) {
  try {
    await requireMember();
    const { url } = await parseBody(req, checkListingRequestSchema);
    return NextResponse.json({ gone: await checkListingUrl(url) });
  } catch (e) {
    return apiErrorResponse(e, "process:check-listing");
  }
}
