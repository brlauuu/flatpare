import type { Apartment, LocationView } from "./types";

export interface EnrichmentPlan {
  geocode: boolean;
  distances: boolean;
}

export function hasAddress(a: Apartment): boolean {
  return a.address !== null && a.address.trim() !== "";
}

// Decides what the client must fetch after a write (#413): coordinates and
// distances for an address that has never been geocoded, and nothing else.
// Never geocoded means either the apartment's first processing (one credit)
// or, when its PDF was read first, the address that processing already paid
// for. A changed address is NOT geocoded again: the views hide its stale
// distances until someone reprocesses, which is a charged request of its
// own. The short code is not here: it is rebuilt in the write itself
// (syncShortCode), so it never waits on a network call (#410).
export function planEnrichment(next: Apartment): EnrichmentPlan {
  const due = hasAddress(next) && next.processedAddress === null;
  return { geocode: due, distances: due };
}

function located(loc: LocationView): boolean {
  return loc.latitude !== null && loc.longitude !== null;
}

export function missingDistances(
  apartment: Apartment,
  locations: LocationView[]
): LocationView[] {
  return locations.filter((l) => located(l) && !(l.id in apartment.distances));
}

export function pruneDistances(
  apartment: Apartment,
  locations: LocationView[]
): Apartment {
  const keep = new Set(locations.map((l) => l.id));
  const distances = Object.fromEntries(
    Object.entries(apartment.distances).filter(([id]) => keep.has(id))
  );
  return { ...apartment, distances };
}
