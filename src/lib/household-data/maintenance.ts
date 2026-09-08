import { missingDistances } from "./enrich";
import type { ApartmentView, LocationView } from "./types";

export type MaintenanceKind = "geocode" | "distances" | "listings";

export interface MaintenanceReport {
  updated: number;
  skipped: number;
  failed: { id: string; reason: string }[];
}

// Pure planners: which rows a maintenance pass should touch. The provider
// runs the network calls and writes.
export function planGeocodeMaintenance(apartments: ApartmentView[]): ApartmentView[] {
  return apartments.filter(
    (a) =>
      !a.corrupt &&
      a.address !== null &&
      a.address.trim() !== "" &&
      (a.latitude === null || a.longitude === null)
  );
}

// "missing" fills gaps (post-create enrichment, a new location); "all"
// recomputes every located pair (the settings page's Recompute button, a
// location whose address moved).
export function planDistanceMaintenance(
  apartments: ApartmentView[],
  locations: LocationView[],
  mode: "missing" | "all" = "missing"
): { apartment: ApartmentView; locations: LocationView[] }[] {
  const located = locations.filter((l) => l.latitude !== null && l.longitude !== null);
  return apartments
    .filter((a) => !a.corrupt && a.latitude !== null && a.longitude !== null)
    .map((apartment) => ({
      apartment,
      locations: mode === "all" ? located : missingDistances(apartment, located),
    }))
    .filter((entry) => entry.locations.length > 0);
}

export function planListingMaintenance(apartments: ApartmentView[]): ApartmentView[] {
  return apartments.filter((a) => !a.corrupt && a.listingUrl !== null && a.listingUrl !== "");
}
