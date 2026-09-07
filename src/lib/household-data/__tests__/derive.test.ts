import { describe, it, expect } from "vitest";
import { deriveApartments, deriveLocations } from "../derive";
import { EMPTY_RATING, emptyApartment, type DecodedApartment, type DecodedRating } from "../types";

const apt = (id: string, data = emptyApartment(`Flat ${id}`)): DecodedApartment => ({
  id, version: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", data,
});
const rating = (apartmentId: string, userId: string, overallFeeling: number, kitchen = 0): DecodedRating => ({
  apartmentId, userId, userName: userId.toUpperCase(), updatedAt: "2026-09-02T00:00:00.000Z",
  data: { ...EMPTY_RATING, overallFeeling, kitchen },
});

describe("deriveApartments", () => {
  it("attaches ratings, averages over non-zero scores, and finds my rating", () => {
    const views = deriveApartments(
      [apt("a")],
      [rating("a", "u1", 4, 2), rating("a", "u2", 2, 0)],
      "u1"
    );
    expect(views).toHaveLength(1);
    expect(views[0].ratings.map((r) => r.userName)).toEqual(["U1", "U2"]);
    expect(views[0].avgOverall).toBe(3);
    expect(views[0].avgKitchen).toBe(2); // u2's 0 is "unrated", not a score
    expect(views[0].myRating).toBe(4);
  });

  it("returns null averages and myRating without ratings", () => {
    const [v] = deriveApartments([apt("a")], [], "u1");
    expect(v.avgOverall).toBeNull();
    expect(v.myRating).toBeNull();
    expect(v.ratings).toEqual([]);
  });

  it("renders a corrupt apartment as a placeholder that keeps its id", () => {
    const [v] = deriveApartments([apt("a", null as never)], [], "u1");
    expect(v.corrupt).toBe(true);
    expect(v.id).toBe("a");
    expect(v.name).toBe("Unreadable apartment");
  });

  it("drops corrupt ratings and ratings of unknown apartments", () => {
    const [v] = deriveApartments(
      [apt("a")],
      [{ ...rating("a", "u1", 3), data: null }, rating("zzz", "u2", 5)],
      "u1"
    );
    expect(v.ratings).toEqual([]);
    expect(v.avgOverall).toBeNull();
  });
});

describe("deriveLocations", () => {
  it("sorts by sortOrder and drops corrupt rows", () => {
    const loc = { label: "L", icon: "Briefcase", address: "A", latitude: null, longitude: null };
    const views = deriveLocations([
      { id: "b", sortOrder: 2, data: { ...loc, label: "B" } },
      { id: "x", sortOrder: 1, data: null },
      { id: "a", sortOrder: 0, data: { ...loc, label: "A" } },
    ]);
    expect(views.map((v) => v.label)).toEqual(["A", "B"]);
    expect(views[0]).toMatchObject({ id: "a", sortOrder: 0 });
  });
});
