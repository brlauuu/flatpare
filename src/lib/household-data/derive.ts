import {
  emptyApartment,
  type Apartment,
  type ApartmentView,
  type DecodedApartment,
  type DecodedLocation,
  type DecodedRating,
  type LocationView,
  type Rating,
  type RatingView,
} from "./types";

type Category = keyof Omit<Rating, "comment">;

// 0 means "not rated" on every category, so it never drags an average down.
function average(ratings: RatingView[], category: Category): number | null {
  const scores = ratings.map((r) => r[category]).filter((v) => v > 0);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// The address was processed, and has been edited since (#413). Changing it
// back to the processed one makes the coordinates and distances current
// again, which is why they are hidden in the view rather than deleted.
export function addressChanged(a: Apartment): boolean {
  return a.processedAddress !== null && (a.address ?? "").trim() !== a.processedAddress.trim();
}

export function deriveApartments(
  apartments: DecodedApartment[],
  ratings: DecodedRating[],
  userId: string
): ApartmentView[] {
  const byApartment = new Map<string, RatingView[]>();
  for (const r of ratings) {
    if (r.data === null) continue;
    const list = byApartment.get(r.apartmentId) ?? [];
    list.push({ ...r.data, userId: r.userId, userName: r.userName, updatedAt: r.updatedAt });
    byApartment.set(r.apartmentId, list);
  }

  return apartments.map((row) => {
    const mine = byApartment.get(row.id) ?? [];
    const meta = {
      id: row.id,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ratings: mine,
      avgKitchen: average(mine, "kitchen"),
      avgBalconies: average(mine, "balconies"),
      avgLocation: average(mine, "location"),
      avgFloorplan: average(mine, "floorplan"),
      avgOverall: average(mine, "overallFeeling"),
      myRating: mine.find((r) => r.userId === userId)?.overallFeeling || null,
    };
    if (row.data === null) {
      return {
        ...emptyApartment("Unreadable apartment"),
        ...meta,
        addressChanged: false,
        corrupt: true as const,
      };
    }
    if (addressChanged(row.data)) {
      return { ...row.data, ...meta, addressChanged: true, latitude: null, longitude: null, distances: {} };
    }
    return { ...row.data, ...meta, addressChanged: false };
  });
}

export function deriveLocations(locations: DecodedLocation[]): LocationView[] {
  return locations
    .filter((l): l is DecodedLocation & { data: NonNullable<DecodedLocation["data"]> } => l.data !== null)
    .map((l) => ({ ...l.data, id: l.id, sortOrder: l.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
