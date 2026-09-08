import { describe, it, expect } from "vitest";
import { missingDistances, planEnrichment, pruneDistances } from "../enrich";
import { emptyApartment, type LocationView } from "../types";

const base = { ...emptyApartment("Flat"), address: "A 1", numRooms: 3, numBathrooms: 1, hasWashingMachine: true };
const loc = (id: string): LocationView => ({
  id, sortOrder: 0, label: id, icon: "Briefcase", address: "X", latitude: 1, longitude: 2,
});

describe("planEnrichment", () => {
  it("does everything for a new apartment with an address", () => {
    expect(planEnrichment(null, base)).toEqual({ geocode: true, shortCode: true, distances: true });
  });

  it("only builds a short code for a new apartment without an address", () => {
    expect(planEnrichment(null, { ...base, address: null })).toEqual({
      geocode: false, shortCode: true, distances: false,
    });
  });

  it("re-geocodes and recomputes distances when the address changes", () => {
    expect(planEnrichment(base, { ...base, address: "B 2" })).toEqual({
      geocode: true, shortCode: true, distances: true,
    });
  });

  it("re-rolls only the short code when rooms, baths or washing machine change", () => {
    expect(planEnrichment(base, { ...base, numRooms: 4 })).toEqual({
      geocode: false, shortCode: true, distances: false,
    });
    expect(planEnrichment(base, { ...base, hasWashingMachine: null })).toEqual({
      geocode: false, shortCode: true, distances: false,
    });
  });

  it("does nothing when only unrelated fields change", () => {
    expect(planEnrichment(base, { ...base, rentChf: 999, summary: "x" })).toEqual({
      geocode: false, shortCode: false, distances: false,
    });
  });
});

describe("missingDistances / pruneDistances", () => {
  it("lists located locations the apartment has no distance for", () => {
    const apt = { ...base, distances: { a: { bikeMin: 1, transitMin: 2 } } };
    const nowhere = { ...loc("c"), latitude: null, longitude: null };
    expect(missingDistances(apt, [loc("a"), loc("b"), nowhere]).map((l) => l.id)).toEqual(["b"]);
  });

  it("drops distances for locations that no longer exist", () => {
    const apt = { ...base, distances: { a: { bikeMin: 1, transitMin: 2 }, gone: { bikeMin: 3, transitMin: 4 } } };
    expect(pruneDistances(apt, [loc("a")]).distances).toEqual({ a: { bikeMin: 1, transitMin: 2 } });
  });
});
