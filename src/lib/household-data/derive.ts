import {
  emptyApartment,
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
      return { ...emptyApartment("Unreadable apartment"), ...meta, corrupt: true as const };
    }
    return { ...row.data, ...meta };
  });
}

export function deriveLocations(locations: DecodedLocation[]): LocationView[] {
  return locations
    .filter((l): l is DecodedLocation & { data: NonNullable<DecodedLocation["data"]> } => l.data !== null)
    .map((l) => ({ ...l.data, id: l.id, sortOrder: l.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
