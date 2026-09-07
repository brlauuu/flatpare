import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { extractPostcode, geocodeLatLngWithReason } from "@/lib/geocode";
import { geocodeRequestSchema } from "@/lib/process-schemas";

// Privacy exception (docs/security-notes.md, "Encrypted data"): the address
// is plaintext here so the server can call the geocoder on the client's
// behalf. It is not logged and nothing is written; the client stores the
// result inside its envelope.
export async function POST(req: Request) {
  try {
    await requireMember();
    const { address } = await parseBody(req, geocodeRequestSchema);
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
