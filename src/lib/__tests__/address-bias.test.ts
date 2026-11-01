import { describe, it, expect } from "vitest";
import { searchBias } from "../address-bias";

// #480: suggestions favour a rough area, never an exact point.
describe("searchBias", () => {
  it("is the middle of the placed points, rounded to a tenth of a degree", () => {
    expect(
      searchBias([
        { latitude: 47.3769, longitude: 8.5417 },
        { latitude: 47.4108, longitude: 8.5441 },
        { latitude: null, longitude: null },
      ])
    ).toEqual({ lat: 47.4, lng: 8.5 });
  });

  it("is null when nothing is placed", () => {
    expect(searchBias([])).toBeNull();
    expect(searchBias([{ latitude: null, longitude: 8 }])).toBeNull();
  });
});
