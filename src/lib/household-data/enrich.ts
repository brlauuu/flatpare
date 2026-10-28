import type { Apartment, LocationView } from "./types";

export interface EnrichmentPlan {
  geocode: boolean;
  distances: boolean;
}

// Decides, from a before/after pair, what the client must fetch after a
// write: coordinates when the address changed, distances whenever
// coordinates will change. The short code is not here: it is rebuilt in the
// write itself (syncShortCode), so it never waits on a network call (#410).
export function planEnrichment(
  previous: Apartment | null,
  next: Apartment
): EnrichmentPlan {
  const hasAddress = next.address !== null && next.address.trim() !== "";
  if (previous === null) {
    return { geocode: hasAddress, distances: hasAddress };
  }
  const addressChanged = previous.address !== next.address;
  return {
    geocode: addressChanged && hasAddress,
    distances: addressChanged && hasAddress,
  };
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
