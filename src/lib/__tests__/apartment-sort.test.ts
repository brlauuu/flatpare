import { describe, it, expect } from "vitest";
import {
  compareApartments,
  type SortableApartment,
} from "@/lib/apartment-sort";

function apt(overrides: Partial<SortableApartment>): SortableApartment {
  return {
    id: 0,
    rentChf: null,
    sizeM2: null,
    numRooms: null,
    avgOverall: null,
    shortCode: null,
    createdAt: null,
    ...overrides,
  };
}

describe("compareApartments", () => {
  it("sorts numeric fields ascending", () => {
    const a = apt({ id: 1, rentChf: 2000 });
    const b = apt({ id: 2, rentChf: 1500 });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeGreaterThan(0);
    expect(compareApartments(b, a, "rentChf", "asc")).toBeLessThan(0);
  });

  it("sorts numeric fields descending", () => {
    const a = apt({ id: 1, rentChf: 2000 });
    const b = apt({ id: 2, rentChf: 1500 });
    expect(compareApartments(a, b, "rentChf", "desc")).toBeLessThan(0);
  });

  it("parses avgOverall from string before comparing", () => {
    const a = apt({ id: 1, avgOverall: "4.5" });
    const b = apt({ id: 2, avgOverall: "3.2" });
    expect(compareApartments(a, b, "avgOverall", "asc")).toBeGreaterThan(0);
  });

  it("parses createdAt from ISO string and compares chronologically", () => {
    const older = apt({ id: 1, createdAt: "2026-01-01T00:00:00Z" });
    const newer = apt({ id: 2, createdAt: "2026-04-01T00:00:00Z" });
    expect(compareApartments(older, newer, "createdAt", "desc")).toBeGreaterThan(0);
    expect(compareApartments(older, newer, "createdAt", "asc")).toBeLessThan(0);
  });

  it("sorts shortCode with natural numeric order", () => {
    const a = apt({ id: 1, shortCode: "F-10" });
    const b = apt({ id: 2, shortCode: "F-2" });
    // Natural order: F-2 < F-10. Ascending puts b before a.
    expect(compareApartments(a, b, "shortCode", "asc")).toBeGreaterThan(0);
  });

  it("puts nulls after non-null values in ascending order", () => {
    const withPrice = apt({ id: 1, rentChf: 1000 });
    const nullPrice = apt({ id: 2, rentChf: null });
    expect(compareApartments(withPrice, nullPrice, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(nullPrice, withPrice, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("puts nulls after non-null values in descending order too", () => {
    const withPrice = apt({ id: 1, rentChf: 1000 });
    const nullPrice = apt({ id: 2, rentChf: null });
    expect(compareApartments(withPrice, nullPrice, "rentChf", "desc")).toBeLessThan(0);
    expect(compareApartments(nullPrice, withPrice, "rentChf", "desc")).toBeGreaterThan(0);
  });

  it("tie-breaks equal primary field by createdAt desc", () => {
    const earlier = apt({
      id: 1,
      rentChf: 2000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const later = apt({
      id: 2,
      rentChf: 2000,
      createdAt: "2026-04-01T00:00:00Z",
    });
    // Same rentChf → tie-break on createdAt desc → later comes first.
    expect(compareApartments(earlier, later, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("tie-breaks equal primary and equal createdAt by id ascending", () => {
    const a = apt({
      id: 5,
      rentChf: 2000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const b = apt({
      id: 9,
      rentChf: 2000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeLessThan(0);
  });

  it("tie-breaks two null primaries by createdAt desc then id asc", () => {
    const a = apt({
      id: 5,
      rentChf: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const b = apt({
      id: 9,
      rentChf: null,
      createdAt: "2026-04-01T00:00:00Z",
    });
    // Both null → tie-break → b (newer createdAt) before a.
    expect(compareApartments(a, b, "rentChf", "asc")).toBeGreaterThan(0);
  });
});
