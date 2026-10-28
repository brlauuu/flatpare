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
//
// The geocode pass only retries an address that was processed and did not
// resolve. It never processes an apartment for the first time or catches up
// a changed address: both spend a credit (#413), and a page visit must not.
export function planGeocodeMaintenance(apartments: ApartmentView[]): ApartmentView[] {
  return apartments.filter(
    (a) =>
      !a.corrupt &&
      a.processed &&
      !a.addressChanged &&
      a.address !== null &&
      a.address.trim() !== "" &&
      (a.latitude === null || a.longitude === null)
  );
}

// "missing" fills gaps (post-create enrichment, a new location); "all"
// recomputes every located pair (the Household page's Recompute button, a
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
