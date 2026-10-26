import { describe, it, expect } from "vitest";
import { localMapPath, panBounds } from "../local-map";

describe("local-map", () => {
  it("serves the file from /map-data/, encoded", () => {
    expect(localMapPath("zurich.pmtiles")).toBe("/map-data/zurich.pmtiles");
    expect(localMapPath("my map.pmtiles")).toBe("/map-data/my%20map.pmtiles");
  });

  it("lets the map pan half a degree past the file's edge", () => {
    expect(panBounds([8, 47, 9, 48])).toEqual([[7.5, 46.5], [9.5, 48.5]]);
  });
});
