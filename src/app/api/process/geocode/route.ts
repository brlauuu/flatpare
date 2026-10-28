import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { extractPostcode, geocodeLatLngWithReason } from "@/lib/geocode";
import { geocodeRequestSchema } from "@/lib/process-schemas";
import { chargeFirstProcessing } from "@/lib/billing";

// Privacy exception (docs/security-notes.md, "Encrypted data"): the address
// is plaintext here so the server can call the geocoder on the client's
// behalf. It is not logged and nothing is written; the client stores the
// result inside its envelope.
//
// Geocoding an apartment is its first processing (#413) unless its PDF was
// read first: the apartment id is charged one credit the first time, before
// the outbound call. A location of interest carries no apartment id.
export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    await consumeRateLimit(householdId, "geocode");
    const { address, apartmentId } = await parseBody(req, geocodeRequestSchema);
    if (apartmentId) await chargeFirstProcessing(householdId, apartmentId);
    const [attempt, postcode] = await Promise.all([
      geocodeLatLngWithReason(address),
      extractPostcode(address),
    ]);
    if (!attempt.result) {
      const reasons = [
        attempt.googleReason && `google: ${attempt.googleReason}`,
        attempt.orsReason && `ors: ${attempt.orsReason}`,
      ].filter(Boolean);
      return NextResponse.json({
        lat: null,
        lng: null,
        postcode,
        reason: reasons.length ? reasons.join("; ") : "unresolved",
      });
    }
    return NextResponse.json({ lat: attempt.result.lat, lng: attempt.result.lng, postcode });
  } catch (e) {
    return apiErrorResponse(e, "process:geocode");
  }
}
