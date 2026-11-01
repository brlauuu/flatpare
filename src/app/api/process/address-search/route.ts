import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { suggestPlaces } from "@/lib/places";
import { addressSearchRequestSchema } from "@/lib/process-schemas";

// Privacy exception (docs/security-notes.md, "Encrypted data"): what has been
// typed of an address is plaintext here so the server can ask Google Places
// for suggestions on the client's behalf (#480). It is not logged and nothing
// is written; the client stores the picked place inside the location's
// envelope.
//
// Free: suggestions are for a location of interest and name no apartment.
// Counted under its own endpoint, so the usage report's geocode count, which
// it weighs against credits, stays the apartments' own.
export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    await consumeRateLimit(householdId, "address-search");
    const { query, sessionToken, language, near } = await parseBody(req, addressSearchRequestSchema);
    return NextResponse.json({ suggestions: await suggestPlaces(query, { sessionToken, language, near }) });
  } catch (e) {
    return apiErrorResponse(e, "process:address-search");
  }
}
