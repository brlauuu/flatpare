import { describe, it, expect } from "vitest";
import { describeApartment, findActive, formatRent, formatRooms, toMapPoints, toMarks } from "../points";
import { seedFromId } from "../marks";
import { emptyApartment, type ApartmentView, type LocationView } from "@/lib/household-data/types";

// Local builders: src/lib must not import from src/components, tests included.
function makeApartmentView(over: Partial<ApartmentView> & { id: string }): ApartmentView {
  return {
    ...emptyApartment(over.name ?? `Apartment ${over.id}`),
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ratings: [],
    avgKitchen: null,
    avgBalconies: null,
    avgLocation: null,
    avgFloorplan: null,
    avgOverall: null,
    myRating: null,
    ...over,
  };
}

function makeLocationView(over: Partial<LocationView> & { id: string }): LocationView {
  return { label: `Location ${over.id}`, icon: "Briefcase", address: "Somewhere 1", latitude: null, longitude: null, sortOrder: 0, ...over };
}

describe("toMapPoints", () => {
  it("places apartments and locations that have coordinates", () => {
    const pts = toMapPoints(
      [makeApartmentView({ id: "a1", shortCode: "BS-01", latitude: 47.56, longitude: 7.59, rentChf: 2350, sizeM2: 78, numRooms: 3.5, avgOverall: 4.2 })],
      [makeLocationView({ id: "l1", label: "Office", latitude: 47.57, longitude: 7.57 })]
    );
    expect(pts.apartments).toEqual([
      { id: "a1", label: "BS-01", name: "Apartment a1", latitude: 47.56, longitude: 7.59, rentChf: 2350, sizeM2: 78, numRooms: 3.5, avgOverall: 4.2 },
    ]);
    expect(pts.locations).toEqual([{ id: "l1", label: "Office", address: "Somewhere 1", latitude: 47.57, longitude: 7.57 }]);
    expect(pts.missing).toEqual([]);
  });

  it("lists apartments without coordinates as missing", () => {
    const pts = toMapPoints([makeApartmentView({ id: "a1", shortCode: "BS-06", latitude: null, longitude: 7.5 })], []);
    expect(pts.apartments).toEqual([]);
    expect(pts.missing).toEqual([{ id: "a1", label: "BS-06" }]);
  });

  it("leaves corrupt rows out entirely", () => {
    const pts = toMapPoints([makeApartmentView({ id: "a1", corrupt: true, latitude: 47, longitude: 7 })], []);
    expect(pts.apartments).toEqual([]);
    expect(pts.missing).toEqual([]);
  });

  it("drops locations without coordinates", () => {
    expect(toMapPoints([], [makeLocationView({ id: "l1" })]).locations).toEqual([]);
  });

  it("falls back to a truncated name when there is no short code", () => {
    const pts = toMapPoints(
      [makeApartmentView({ id: "a1", name: "A very long apartment name on Hauptstrasse", latitude: 47, longitude: 7 })],
      []
    );
    expect(pts.apartments[0].label).toBe("A very long apartme…");
    expect(pts.apartments[0].label.length).toBeLessThanOrEqual(20);
  });
});

describe("formatting", () => {
  it("formats rent as Swiss francs", () => {
    expect(formatRent(3100)).toMatch(/^CHF 3.100$/);
  });

  it("formats rooms", () => {
    expect(formatRooms(4.5)).toBe("4.5 rooms");
    expect(formatRooms(1)).toBe("1 room");
  });

  it("describes an apartment for a screen reader, skipping what is unknown", () => {
    const base = { id: "a1", label: "BS-04", name: "x", latitude: 0, longitude: 0, numRooms: null, avgOverall: null };
    expect(describeApartment({ ...base, rentChf: 3100, sizeM2: 104 })).toMatch(/^BS-04, CHF 3.100, 104 m², opens apartment$/);
    expect(describeApartment({ ...base, rentChf: null, sizeM2: null })).toBe("BS-04, opens apartment");
  });
});

describe("toMarks", () => {
  const pts = toMapPoints(
    [makeApartmentView({ id: "a1", shortCode: "BS-01", latitude: 47.56, longitude: 7.59, rentChf: 2350 })],
    [makeLocationView({ id: "l1", label: "Office", latitude: 47.57, longitude: 7.57 })]
  );

  it("lists every mark with its position, label, screen-reader text and link", () => {
    const [apt, loc] = toMarks(pts);
    expect(apt).toMatchObject({ key: "apartment:a1", kind: "apartment", id: "a1", label: "BS-01", lngLat: [7.59, 47.56], href: "/apartments/a1" });
    expect(apt.ariaLabel).toMatch(/^BS-01, CHF 2.350, opens apartment$/);
    expect(loc).toMatchObject({ key: "location:l1", kind: "location", id: "l1", label: "Office", ariaLabel: "Office", lngLat: [7.57, 47.57], href: null });
  });

  it("seeds each mark's wobble from its id", () => {
    const [apt] = toMarks(pts);
    expect(apt.seed).toBe(seedFromId("a1"));
  });
});

describe("findActive", () => {
  const pts = toMapPoints(
    [makeApartmentView({ id: "a1", latitude: 47, longitude: 7 })],
    [makeLocationView({ id: "l1", latitude: 47, longitude: 7 })]
  );

  it("resolves the open card to its point", () => {
    expect(findActive(pts, { kind: "apartment", id: "a1" })).toEqual({ kind: "apartment", point: pts.apartments[0] });
    expect(findActive(pts, { kind: "location", id: "l1" })).toEqual({ kind: "location", point: pts.locations[0] });
  });

  it("is null when nothing is open, or the point has gone (a store refresh removed it)", () => {
    expect(findActive(pts, null)).toBeNull();
    expect(findActive(pts, { kind: "apartment", id: "gone" })).toBeNull();
    expect(findActive(pts, { kind: "location", id: "a1" })).toBeNull();
  });
});
