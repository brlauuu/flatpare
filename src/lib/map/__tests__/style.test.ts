import { describe, it, expect } from "vitest";
import { mapStyle, TILES_URL, GLYPHS_URL } from "../style";

type AnyLayer = { id: string; type: string; "source-layer"?: string; filter?: unknown; minzoom?: number; paint?: Record<string, unknown> };
const layers = (theme: "light" | "dark") => mapStyle(theme).layers as AnyLayer[];

describe("mapStyle", () => {
  it("reads OpenFreeMap tiles and glyphs, no key", () => {
    const style = mapStyle("light");
    expect(style.version).toBe(8);
    expect(style.glyphs).toBe(GLYPHS_URL);
    expect(style.sources).toEqual({ omt: { type: "vector", url: TILES_URL } });
    expect(TILES_URL).toBe("https://tiles.openfreemap.org/planet");
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
