import { describe, it, expect } from "vitest";
import {
  compareApartments,
  listSortOptions,
  compareSortOptions,
  parseLocationSortField,
  type SortableApartment,
} from "@/lib/apartment-sort";

function apt(overrides: Partial<SortableApartment> = {}): SortableApartment {
  return {
    id: "a",
    rentChf: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    distances: {},
    avgOverall: null,
    shortCode: null,
    createdAt: null,
    ...overrides,
  };
}

const withBike = (min: number | null) => ({
  "loc-1": { bikeMin: min, transitMin: null },
});
const withTransit = (min: number | null) => ({
  "loc-1": { bikeMin: null, transitMin: min },
});

describe("compareApartments", () => {
  it("sorts numeric fields ascending and descending", () => {
    const a = apt({ id: "a", rentChf: 1000 });
    const b = apt({ id: "b", rentChf: 2000 });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(a, b, "rentChf", "desc")).toBeGreaterThan(0);
  });

  it("compares avgOverall numerically", () => {
    const a = apt({ id: "a", avgOverall: 4.5 });
    const b = apt({ id: "b", avgOverall: 3.2 });
    expect(compareApartments(a, b, "avgOverall", "desc")).toBeLessThan(0);
  });

  it("sorts createdAt chronologically", () => {
    const older = apt({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const newer = apt({ id: "b", createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(older, newer, "createdAt", "asc")).toBeLessThan(0);
    expect(compareApartments(older, newer, "createdAt", "desc")).toBeGreaterThan(0);
  });

  it("sorts shortCode in natural order", () => {
    const a = apt({ id: "a", shortCode: "F-10" });
    const b = apt({ id: "b", shortCode: "F-2" });
    expect(compareApartments(a, b, "shortCode", "asc")).toBeGreaterThan(0);
  });

  it("puts nulls last regardless of direction", () => {
    const has = apt({ id: "a", rentChf: 1000 });
    const none = apt({ id: "b", rentChf: null });
    expect(compareApartments(has, none, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(has, none, "rentChf", "desc")).toBeLessThan(0);
    expect(compareApartments(none, has, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("breaks ties by createdAt desc, then id asc", () => {
    const older = apt({ id: "a", rentChf: 1000, createdAt: "2026-01-01T00:00:00Z" });
    const newer = apt({ id: "b", rentChf: 1000, createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(older, newer, "rentChf", "asc")).toBeGreaterThan(0);

    const x = apt({ id: "x", rentChf: 1000 });
    const y = apt({ id: "y", rentChf: 1000 });
    expect(compareApartments(x, y, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(y, x, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("falls through to tie-breakers when both primaries are null", () => {
    const a = apt({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const b = apt({ id: "b", createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("puts a null createdAt last in both directions", () => {
    const dated = apt({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const undated = apt({ id: "b", createdAt: null });
    expect(compareApartments(dated, undated, "createdAt", "asc")).toBeLessThan(0);
    expect(compareApartments(dated, undated, "createdAt", "desc")).toBeLessThan(0);
  });

  it("sorts numBathrooms and numBalconies", () => {
    const a = apt({ id: "a", numBathrooms: 1, numBalconies: 2 });
    const b = apt({ id: "b", numBathrooms: 2, numBalconies: 1 });
    expect(compareApartments(a, b, "numBathrooms", "asc")).toBeLessThan(0);
    expect(compareApartments(a, b, "numBalconies", "desc")).toBeLessThan(0);
  });

  it("sorts by bike distance to a location, nulls last", () => {
    const near = apt({ id: "a", distances: withBike(5) });
    const far = apt({ id: "b", distances: withBike(20) });
    const unknown = apt({ id: "c", distances: withBike(null) });
    expect(compareApartments(near, far, "bikeTo:loc-1", "asc")).toBeLessThan(0);
    expect(compareApartments(far, unknown, "bikeTo:loc-1", "asc")).toBeLessThan(0);
    expect(compareApartments(far, unknown, "bikeTo:loc-1", "desc")).toBeLessThan(0);
  });

  it("sorts by transit distance and tie-breaks on createdAt", () => {
    const a = apt({ id: "a", distances: withTransit(10), createdAt: "2026-01-01T00:00:00Z" });
    const b = apt({ id: "b", distances: withTransit(10), createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(a, b, "transitTo:loc-1", "asc")).toBeGreaterThan(0);
  });

  it("treats a missing location entry as null", () => {
    const has = apt({ id: "a", distances: withBike(5) });
    const missing = apt({ id: "b", distances: {} });
    expect(compareApartments(has, missing, "bikeTo:loc-1", "asc")).toBeLessThan(0);
  });
});

describe("parseLocationSortField", () => {
  it("parses uuid-style location ids", () => {
    expect(parseLocationSortField("bikeTo:3f2a-11")).toEqual({ mode: "bike", locationId: "3f2a-11" });
    expect(parseLocationSortField("transitTo:x")).toEqual({ mode: "transit", locationId: "x" });
    expect(parseLocationSortField("rentChf")).toBeNull();
    expect(parseLocationSortField("bikeTo:")).toBeNull();
  });
});

describe("sort options", () => {
  const locations = [
    { id: "loc-1", label: "Work" },
    { id: "loc-2", label: "Gym" },
  ];

  it("lists the six static fields then bike/transit per location", () => {
    const ids = listSortOptions(locations).map((o) => o.id);
    expect(ids).toEqual([
      "createdAt", "rentChf", "sizeM2", "numRooms", "avgOverall", "shortCode",
      "bikeTo:loc-1", "transitTo:loc-1", "bikeTo:loc-2", "transitTo:loc-2",
    ]);
    expect(listSortOptions(locations).find((o) => o.id === "bikeTo:loc-1")?.label).toBe("Bike to Work");
  });

  it("compare options include all eight static fields", () => {
    const ids = compareSortOptions(locations).map((o) => o.id);
    expect(ids.slice(0, 8)).toEqual([
      "createdAt", "rentChf", "sizeM2", "numRooms", "numBathrooms", "numBalconies", "avgOverall", "shortCode",
    ]);
    expect(ids).toContain("transitTo:loc-2");
  });
});
