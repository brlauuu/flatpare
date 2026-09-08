import type { Apartment, LocationView } from "./types";

export interface EnrichmentPlan {
  geocode: boolean;
  shortCode: boolean;
  distances: boolean;
}

// Decides, from a before/after pair, what the client must compute after a
// write: coordinates when the address changed, the short code when any of
// its inputs changed, distances whenever coordinates will change.
export function planEnrichment(
  previous: Apartment | null,
  next: Apartment
): EnrichmentPlan {
  const hasAddress = next.address !== null && next.address.trim() !== "";
  if (previous === null) {
    return { geocode: hasAddress, shortCode: true, distances: hasAddress };
  }
  const addressChanged = previous.address !== next.address;
  const codeInputsChanged =
    addressChanged ||
    previous.numRooms !== next.numRooms ||
    previous.numBathrooms !== next.numBathrooms ||
    previous.hasWashingMachine !== next.hasWashingMachine;
  return {
    geocode: addressChanged && hasAddress,
    shortCode: codeInputsChanged,
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
