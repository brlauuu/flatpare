import type { Apartment } from "./types";

// Features a listing mentions that matter when choosing (#471). Each is
// yes / no / unknown (null), like the washing machine: read from the PDF
// when the listing states it, editable by any member, one row each in
// Compare. A fixed list, not free tags, so Compare can line them up.
// Balconies are counted separately (numBalconies).
export const APARTMENT_FEATURES = [
  "hasWoodenFloor",
  "hasGarden",
  "hasTerrace",
  "hasElevator",
  "hasCellar",
  "hasParking",
  "hasDishwasher",
  "petsAllowed",
] as const satisfies readonly (keyof Apartment)[];

export type ApartmentFeature = (typeof APARTMENT_FEATURES)[number];

export type ApartmentFeatures = Record<ApartmentFeature, boolean | null>;

export function emptyFeatures(): ApartmentFeatures {
  return Object.fromEntries(APARTMENT_FEATURES.map((f) => [f, null])) as ApartmentFeatures;
}
