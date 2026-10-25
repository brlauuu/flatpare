import { describe, it, expect } from "vitest";
import { availableExtracts, chooseExtract, extractPath, MAP_EXTRACTS, panBounds, type MapExtract } from "../extracts";
import { pickTiles, OPENFREEMAP } from "../style";

const CH = MAP_EXTRACTS[0];
const ZURICH = { latitude: 47.3769, longitude: 8.5417 };
const BASEL = { latitude: 47.5596, longitude: 7.5886 };
const MILAN = { latitude: 45.4642, longitude: 9.19 };
const OTHER: MapExtract = { ...CH, id: "xx", bounds: [9, 45, 10, 46], file: "xx.pmtiles" };

describe("MAP_EXTRACTS", () => {
  it("pins each file by name, size and sha256, from a map-data release", () => {
    for (const e of MAP_EXTRACTS) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.bytes).toBeGreaterThan(0);
      expect(e.file).toMatch(new RegExp(`^${e.id}-\\d{4}-\\d{2}-\\d{2}\\.pmtiles$`));
      expect(e.url).toMatch(new RegExp(`^https://github\\.com/brlauuu/flatpare/releases/download/map-data-\\d{4}-\\d{2}-\\d{2}/${e.file}$`));
      const [west, south, east, north] = e.bounds;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
    }
    expect(new Set(MAP_EXTRACTS.map((e) => e.id)).size).toBe(MAP_EXTRACTS.length);
  });

  it("serves a file from public/map-data/", () => {
    expect(extractPath(CH)).toBe(`/map-data/${CH.file}`);
  });
});

describe("availableExtracts", () => {
  it("reads the build's comma-separated list and ignores unknown ids", () => {
    expect(availableExtracts("ch")).toEqual([CH]);
    expect(availableExtracts(" ch , nope ")).toEqual([CH]);
    expect(availableExtracts("")).toEqual([]);
    expect(availableExtracts(undefined)).toEqual([]);
  });
});

describe("chooseExtract", () => {
  it("picks the file holding every point", () => {
    expect(chooseExtract([ZURICH, BASEL], [CH])).toBe(CH);
  });

  it("falls back when any point lies outside, or nothing is available", () => {
    expect(chooseExtract([ZURICH, MILAN], [CH])).toBeNull();
    expect(chooseExtract([ZURICH], [])).toBeNull();
  });

  it("uses the first file when nothing is placed yet", () => {
    expect(chooseExtract([], [CH, OTHER])).toBe(CH);
    expect(chooseExtract([], [])).toBeNull();
  });

  it("tries each file in turn", () => {
    expect(chooseExtract([MILAN], [CH, OTHER])).toBe(OTHER);
  });
});

describe("panBounds", () => {
  it("lets the map pan half a degree past the file's edge", () => {
    const [[w, s], [e, n]] = panBounds(CH);
    expect(w).toBeCloseTo(CH.bounds[0] - 0.5);
    expect(s).toBeCloseTo(CH.bounds[1] - 0.5);
    expect(e).toBeCloseTo(CH.bounds[2] + 0.5);
    expect(n).toBeCloseTo(CH.bounds[3] + 0.5);
  });
});

describe("pickTiles", () => {
  it("returns our file inside it and OpenFreeMap outside", () => {
    expect(pickTiles([ZURICH], [CH], "https://x.example")).toEqual({
      tiles: { kind: "self", url: `pmtiles://https://x.example/map-data/${CH.file}` },
      extract: CH,
    });
    expect(pickTiles([MILAN], [CH], "https://x.example")).toEqual({ tiles: OPENFREEMAP, extract: null });
  });
});
