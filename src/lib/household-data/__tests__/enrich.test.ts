import { describe, it, expect } from "vitest";
import { missingDistances, planEnrichment, pruneDistances } from "../enrich";
import { emptyApartment, type LocationView } from "../types";

const base = { ...emptyApartment("Flat"), address: "A 1", numRooms: 3, numBathrooms: 1, hasWashingMachine: true };
const loc = (id: string): LocationView => ({
  id, sortOrder: 0, label: id, icon: "Briefcase", address: "X", latitude: 1, longitude: 2,
});

describe("planEnrichment", () => {
  it("geocodes and measures an address that was never geocoded", () => {
    expect(planEnrichment(base)).toEqual({ geocode: true, distances: true });
    // Processed by its PDF first: the address is covered by the same credit.
    expect(planEnrichment({ ...base, processed: true })).toEqual({ geocode: true, distances: true });
  });

  it("fetches nothing for an apartment without an address", () => {
    expect(planEnrichment({ ...base, address: null })).toEqual({ geocode: false, distances: false });
    expect(planEnrichment({ ...base, address: "  " })).toEqual({ geocode: false, distances: false });
  });

  // #413: changing the address does not reprocess; a reprocess is charged.
  it("does not geocode a changed address again", () => {
    const processed = { ...base, processed: true, processedAddress: "A 1" };
    expect(planEnrichment({ ...processed, address: "B 2" })).toEqual({ geocode: false, distances: false });
    expect(planEnrichment(processed)).toEqual({ geocode: false, distances: false });
  });

  it("fetches nothing when only other fields change; the write rebuilds the code (#410)", () => {
    const processed = { ...base, processed: true, processedAddress: "A 1" };
    expect(planEnrichment({ ...processed, numRooms: 4, rentChf: 999 })).toEqual({
      geocode: false, distances: false,
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
