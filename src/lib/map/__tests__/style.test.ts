import { describe, it, expect } from "vitest";
import { mapStyle, selfTiles, OPENFREEMAP, SELF_ATTRIBUTION, TILES_URL, GLYPHS_URL } from "../style";
import { SELF_GLYPHS_URL } from "../glyphs";

type AnyLayer = { id: string; type: string; "source-layer"?: string; filter?: unknown; minzoom?: number; paint?: Record<string, unknown> };
const layers = (theme: "light" | "dark") => mapStyle(theme, OPENFREEMAP).layers as AnyLayer[];
const ORIGIN = "http://flatpare.local:3002";

describe("mapStyle", () => {
  it("reads OpenFreeMap tiles and glyphs, no key, as the fallback", () => {
    const style = mapStyle("light", OPENFREEMAP);
    expect(style.version).toBe(8);
    expect(style.glyphs).toBe(GLYPHS_URL);
    expect(style.sources).toEqual({ omt: { type: "vector", url: TILES_URL } });
    expect(TILES_URL).toBe("https://tiles.openfreemap.org/planet");
  });

  it("reads a self-hoster's own file and fonts from this origin, with the licence's credit (#339)", () => {
    const style = mapStyle("dark", selfTiles(ORIGIN, "zurich.pmtiles"));
    expect(style.glyphs).toBe(SELF_GLYPHS_URL);
    expect(style.sources).toEqual({
      omt: { type: "vector", url: `pmtiles://${ORIGIN}/map-data/zurich.pmtiles`, attribution: SELF_ATTRIBUTION },
    });
    expect(SELF_ATTRIBUTION).toContain("OpenMapTiles");
    expect(SELF_ATTRIBUTION).toContain("OpenStreetMap contributors");
    expect(JSON.stringify(style)).not.toContain("openfreemap");
  });

  it("draws the same layers from either source", () => {
    const self = mapStyle("light", selfTiles(ORIGIN, "zurich.pmtiles")).layers;
    expect(self).toEqual(mapStyle("light", OPENFREEMAP).layers);
  });

  it.each(["light", "dark"] as const)("never draws buildings, numbers, POIs or a background (%s)", (theme) => {
    const sourceLayers = layers(theme).map((l) => l["source-layer"]);
    for (const banned of ["building", "housenumber", "poi", "aerodrome_label", "mountain_peak", "boundary"]) {
      expect(sourceLayers).not.toContain(banned);
    }
    expect(layers(theme).some((l) => l.type === "background")).toBe(false);
  });

  it("draws streets, water, parks, and street and neighbourhood names", () => {
    const sourceLayers = new Set(layers("light").map((l) => l["source-layer"]));
    for (const wanted of ["transportation", "water", "waterway", "park", "transportation_name", "place", "water_name"]) {
      expect(sourceLayers).toContain(wanted);
    }
  });

  it("leaves rivers out of the waterway line (the water fill already draws them)", () => {
    const line = layers("light").find((l) => l.id === "waterway");
    expect(line?.filter).toEqual(["!=", ["get", "class"], "river"]);
  });

  it("shows street names from zoom 14", () => {
    expect(layers("light").find((l) => l.id === "street-name")?.minzoom).toBe(14);
  });

  it("uses the theme's water colour", () => {
    const water = (t: "light" | "dark") => layers(t).find((l) => l.id === "water")?.paint?.["fill-color"];
    expect(water("light")).toBe("#cfe0ff");
    expect(water("dark")).toBe("#16304d");
  });
});
