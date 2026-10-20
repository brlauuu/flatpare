import type { ApartmentDistance } from "@/lib/household-data/types";

export type StaticSortField =
  | "createdAt"
  | "rentChf"
  | "sizeM2"
  | "numRooms"
  | "numBathrooms"
  | "numBalconies"
  | "avgOverall"
  | "shortCode";

// `bikeTo:<locationId>` and `transitTo:<locationId>` are generated at runtime
// from the user's configured locations of interest.
export type LocationSortField = `bikeTo:${string}` | `transitTo:${string}`;

export type SortField = StaticSortField | LocationSortField;

const STATIC_FIELDS: StaticSortField[] = [
  "createdAt",
  "rentChf",
  "sizeM2",
  "numRooms",
  "numBathrooms",
  "numBalconies",
  "avgOverall",
  "shortCode",
];

export type SortDirection = "asc" | "desc";

export interface SortableApartment {
  id: string;
  rentChf: number | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  distances: Record<string, ApartmentDistance>;
  avgOverall: number | null;
  shortCode: string | null;
  createdAt: string | null;
}

export function parseLocationSortField(
  field: string
): { mode: "bike" | "transit"; locationId: string } | null {
  const m = /^(bikeTo|transitTo):(.+)$/.exec(field);
  if (!m) return null;
  return { mode: m[1] === "bikeTo" ? "bike" : "transit", locationId: m[2] };
}

function extract(apt: SortableApartment, field: SortField): number | string | null {
  const loc = parseLocationSortField(field);
  if (loc) {
    const d = apt.distances[loc.locationId];
    if (!d) return null;
    return loc.mode === "bike" ? d.bikeMin : d.transitMin;
  }
  switch (field) {
    case "createdAt": {
      if (apt.createdAt === null) return null;
      const t = Date.parse(apt.createdAt);
      return Number.isNaN(t) ? null : t;
    }
    case "avgOverall":
      return apt.avgOverall;
    case "shortCode":
      return apt.shortCode;
    default:
      // `field` is a StaticSortField here: the location-scoped fields were
      // handled by the `loc` branch above, but that's a runtime check the
      // type checker can't see through.
      return apt[field as StaticSortField];
  }
}

// The words for each option come from the caller (#288): this module stays
// pure, and the pages build a SortText from the `common.sort` catalogue.
export interface SortText {
  field(id: StaticSortField): string;
  bikeTo(place: string): string;
  transitTo(place: string): string;
}

// Apartments-list sort dropdown defaults — a curated subset of static fields
// shown even when no locations are configured.
const STATIC_LIST_SORT_FIELDS: StaticSortField[] = [
  "createdAt",
  "rentChf",
  "sizeM2",
  "numRooms",
  "avgOverall",
  "shortCode",
];

export interface LocationLite {
  id: string;
  label: string;
}

type SortFieldOption = { id: SortField; label: string };

function locationOptions(locations: LocationLite[], text: SortText): SortFieldOption[] {
  return locations.flatMap((loc) => [
    { id: `bikeTo:${loc.id}` as SortField, label: text.bikeTo(loc.label) },
    { id: `transitTo:${loc.id}` as SortField, label: text.transitTo(loc.label) },
  ]);
}

export function listSortOptions(locations: LocationLite[], text: SortText): SortFieldOption[] {
  const base = STATIC_LIST_SORT_FIELDS.map((id) => ({ id, label: text.field(id) }));
  return [...base, ...locationOptions(locations, text)];
}

export function compareSortOptions(locations: LocationLite[], text: SortText): SortFieldOption[] {
  const base = STATIC_FIELDS.map((id) => ({ id, label: text.field(id) }));
  return [...base, ...locationOptions(locations, text)];
}

function compareValues(
  va: number | string | null,
  vb: number | string | null
): number {
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (typeof va === "string" && typeof vb === "string") {
    return va.localeCompare(vb, undefined, { numeric: true });
  }
  if (typeof va === "number" && typeof vb === "number") {
    return va - vb;
  }
  return 0;
}

export function compareApartments(
  a: SortableApartment,
  b: SortableApartment,
  field: SortField,
  direction: SortDirection
): number {
  const va = extract(a, field);
  const vb = extract(b, field);
  const primary = compareValues(va, vb);
  if (primary !== 0) {
    if (va === null || vb === null) return primary;
    return direction === "asc" ? primary : -primary;
  }
  const createdCmp = compareValues(extract(a, "createdAt"), extract(b, "createdAt"));
  if (createdCmp !== 0) return -createdCmp;
  return a.id.localeCompare(b.id);
}

export const SORT_FIELD_STORAGE_KEY = "flatpare-apartments-sort-field";
export const SORT_DIRECTION_STORAGE_KEY = "flatpare-apartments-sort-direction";
export const SORT_CHANGE_EVENT = "flatpare-apartments-sort-change";
export const COMPARE_SORT_FIELD_STORAGE_KEY = "flatpare-compare-sort-field";
export const COMPARE_SORT_DIRECTION_STORAGE_KEY =
  "flatpare-compare-sort-direction";
export const COMPARE_SORT_CHANGE_EVENT = "flatpare-compare-sort-change";

export function isSortField(v: string): v is SortField {
  if ((STATIC_FIELDS as string[]).includes(v)) return true;
  return parseLocationSortField(v) !== null;
}

export function isSortDirection(v: string): v is SortDirection {
  return v === "asc" || v === "desc";
}
