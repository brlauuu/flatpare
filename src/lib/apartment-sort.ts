export type SortField =
  | "createdAt"
  | "rentChf"
  | "sizeM2"
  | "numRooms"
  | "avgOverall"
  | "shortCode";

export type SortDirection = "asc" | "desc";

export interface SortableApartment {
  id: number;
  rentChf: number | null;
  sizeM2: number | null;
  numRooms: number | null;
  avgOverall: string | null;
  shortCode: string | null;
  createdAt: string | null;
}

type Extractor = (apt: SortableApartment) => number | string | null;

const EXTRACTORS: Record<SortField, Extractor> = {
  rentChf: (a) => a.rentChf,
  sizeM2: (a) => a.sizeM2,
  numRooms: (a) => a.numRooms,
  avgOverall: (a) => (a.avgOverall === null ? null : parseFloat(a.avgOverall)),
  createdAt: (a) => (a.createdAt === null ? null : Date.parse(a.createdAt)),
  shortCode: (a) => a.shortCode,
};

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  createdAt: "Date added",
  rentChf: "Price",
  sizeM2: "Size",
  numRooms: "Rooms",
  avgOverall: "Avg rating",
  shortCode: "Short code",
};

function compareValues(
  va: number | string | null,
  vb: number | string | null
): number {
  // Nulls always sort last, regardless of direction — caller applies direction
  // only to the primary comparison result (not to null handling).
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (typeof va === "string" && typeof vb === "string") {
    return va.localeCompare(vb, undefined, { numeric: true });
  }
  if (typeof va === "number" && typeof vb === "number") {
    return va - vb;
  }
  // Mixed types shouldn't happen for a given field; fall back to 0.
  return 0;
}

export function compareApartments(
  a: SortableApartment,
  b: SortableApartment,
  field: SortField,
  direction: SortDirection
): number {
  const extract = EXTRACTORS[field];
  const va = extract(a);
  const vb = extract(b);
  const primary = compareValues(va, vb);
  if (primary !== 0) {
    // Direction only flips the primary comparison. If one side is null, the
    // non-null side already won above — that win is direction-independent.
    if (va === null || vb === null) return primary;
    return direction === "asc" ? primary : -primary;
  }

  // Tie-break: createdAt desc (newer first), then id ascending.
  const createdCmp = compareValues(
    EXTRACTORS.createdAt(a),
    EXTRACTORS.createdAt(b)
  );
  if (createdCmp !== 0) {
    // Desc by default — newer first.
    return -createdCmp;
  }
  return a.id - b.id;
}

export const SORT_FIELD_STORAGE_KEY = "flatpare-apartments-sort-field";
export const SORT_DIRECTION_STORAGE_KEY = "flatpare-apartments-sort-direction";
export const SORT_CHANGE_EVENT = "flatpare-apartments-sort-change";

export const SORT_FIELD_IDS = Object.keys(SORT_FIELD_LABELS) as SortField[];

export function isSortField(v: string): v is SortField {
  return (SORT_FIELD_IDS as string[]).includes(v);
}

export function isSortDirection(v: string): v is SortDirection {
  return v === "asc" || v === "desc";
}
