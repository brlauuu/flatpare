import type { EnrichmentPlan } from "@/lib/household-data/enrich";
import { missingDistances } from "@/lib/household-data/enrich";
import { postcodeFromShortCode, uniqueShortCode } from "@/lib/household-data/short-code";
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
// row; an *unresolved* geocode is not a failure (coordinates stay null).
export async function enrichApartment(
  data: Apartment,
  locations: LocationView[],
  takenCodes: Set<string>,
  plan: EnrichmentPlan,
  random: () => number = Math.random
): Promise<Apartment> {
  let next: Apartment = { ...data, distances: { ...data.distances } };
  let postcode: string | null = data.shortCode ? postcodeFromShortCode(data.shortCode) : null;

  const address = next.address?.trim() ?? "";
  if (plan.geocode && address !== "") {
    const geo = await geocodeAddress(address);
    next = { ...next, latitude: geo.lat, longitude: geo.lng };
    postcode = geo.postcode;
    if (geo.lat === null) next = { ...next, distances: {} };
  }

  if (plan.shortCode) {
    next = {
      ...next,
      shortCode: uniqueShortCode(
        {
          numRooms: next.numRooms,
          numBathrooms: next.numBathrooms,
          hasWashingMachine: next.hasWashingMachine,
          postcode,
        },
        takenCodes,
        random
      ),
    };
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
