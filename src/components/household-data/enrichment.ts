import type { EnrichmentPlan } from "@/lib/household-data/enrich";
import { missingDistances } from "@/lib/household-data/enrich";
import { withPostcode } from "@/lib/household-data/short-code";
import type { Apartment, ApartmentDistance, LocationView } from "@/lib/household-data/types";
import { mapConcurrent } from "@/lib/household-data/concurrency";
import { distanceBetween, geocodeAddress } from "./process-client";

const DISTANCE_CONCURRENCY = 3;

function located(loc: LocationView): boolean {
  return loc.latitude !== null && loc.longitude !== null;
}

// Runs one enrichment plan over a plaintext apartment and returns the
// enriched copy. Pure apart from the two process calls; the caller writes
// the result. Throws on a network/server failure so the caller can flag the
// row; an *unresolved* geocode is not a failure (coordinates stay null) and
// still counts as processed. `chargeId` names the apartment when this geocode
// is its first processing (#413); the server then spends its credit, and a
// 402 is thrown like any other failure.
export async function enrichApartment(
  data: Apartment,
  locations: LocationView[],
  takenLetters: Set<string>,
  plan: EnrichmentPlan,
  random: () => number = Math.random,
  chargeId?: string
): Promise<Apartment> {
  let next: Apartment = { ...data, distances: { ...data.distances } };

  const address = next.address?.trim() ?? "";
  if (plan.geocode && address !== "") {
    const geo = await geocodeAddress(address, chargeId);
    next = withPostcode({ ...next, latitude: geo.lat, longitude: geo.lng }, geo.postcode, takenLetters, random);
    next = { ...next, processed: true, processedAddress: next.address };
    if (geo.lat === null) next = { ...next, distances: {} };
  }

  if (next.latitude !== null && next.longitude !== null && address !== "") {
    const targets = plan.distances ? locations.filter(located) : missingDistances(next, locations);
    const computed = await mapConcurrent(targets, DISTANCE_CONCURRENCY, (loc) =>
      distanceBetween(address, loc.address)
    );
    const distances: Record<string, ApartmentDistance> = { ...next.distances };
    targets.forEach((loc, i) => {
      distances[loc.id] = computed[i];
    });
    next = { ...next, distances };
  }

  return next;
}
