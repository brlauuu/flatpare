import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { resolvePlace } from "@/lib/places";
import { addressPlaceRequestSchema } from "@/lib/process-schemas";

// Privacy exception, as in address-search (#480): a picked suggestion's id
// in, its address and coordinates out, nothing logged or written. This call
// closes the search's Places session. Free, counted under its own endpoint.
export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    await consumeRateLimit(householdId, "address-place");
    const { placeId, sessionToken, language } = await parseBody(req, addressPlaceRequestSchema);
    return NextResponse.json({ place: await resolvePlace(placeId, { sessionToken, language }) });
  } catch (e) {
    return apiErrorResponse(e, "process:address-place");
  }
}
