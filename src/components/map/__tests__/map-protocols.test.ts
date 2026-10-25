import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const addProtocol = vi.fn();
vi.mock("maplibre-gl", () => ({ addProtocol }));
vi.mock("pmtiles", () => ({
  Protocol: class {
    tile = "pmtiles-tile-handler";
  },
}));

type Handler = (params: { url: string }, abort: AbortController) => Promise<{ data: ArrayBuffer }>;

async function load() {
  vi.resetModules();
  addProtocol.mockClear();
  return import("../map-protocols");
}

function glyphHandler(): Handler {
  return addProtocol.mock.calls.find(([name]) => name === "flatpare-glyphs")![1] as Handler;
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("registerMapProtocols", () => {
  it("registers pmtiles and the glyph scheme once", async () => {
    const { registerMapProtocols } = await load();
    registerMapProtocols();
    registerMapProtocols();
    expect(addProtocol.mock.calls.map(([name]) => name)).toEqual(["pmtiles", "flatpare-glyphs"]);
    expect(addProtocol.mock.calls[0][1]).toBe("pmtiles-tile-handler");
  });

  it("serves a shipped glyph range from public/map-fonts/", async () => {
    const { registerMapProtocols } = await load();
    registerMapProtocols();
    const body = new Uint8Array([1, 2, 3]).buffer;
    vi.mocked(fetch).mockResolvedValue(new Response(body));
    const result = await glyphHandler()({ url: "flatpare-glyphs://Noto%20Sans%20Regular/0-255" }, new AbortController());
    expect(fetch).toHaveBeenCalledWith("/map-fonts/noto-sans-regular/0-255.pbf", expect.anything());
    expect(new Uint8Array(result.data)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("answers an unshipped range, or a failed fetch, with an empty set", async () => {
    const { registerMapProtocols } = await load();
    registerMapProtocols();
    const unshipped = await glyphHandler()({ url: "flatpare-glyphs://Noto%20Sans%20Regular/1536-1791" }, new AbortController());
    expect(unshipped.data.byteLength).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 404 }));
    const missing = await glyphHandler()({ url: "flatpare-glyphs://Noto%20Sans%20Bold/0-255" }, new AbortController());
    expect(missing.data.byteLength).toBe(0);
  });
});

describe("mapTilesFor", () => {
  it("reads our file when the build put it in place", async () => {
    vi.stubEnv("FLATPARE_MAP_EXTRACTS", "ch");
    const { mapTilesFor } = await load();
    const { MAP_EXTRACTS, panBounds } = await import("@/lib/map/extracts");
    const { tiles, maxBounds } = mapTilesFor([{ latitude: 47.37, longitude: 8.54 }]);
    expect(tiles).toEqual({ kind: "self", url: `pmtiles://${window.location.origin}/map-data/${MAP_EXTRACTS[0].file}` });
    expect(maxBounds).toEqual(panBounds(MAP_EXTRACTS[0]));
  });

  it("falls back to OpenFreeMap when it did not", async () => {
    vi.stubEnv("FLATPARE_MAP_EXTRACTS", "");
    const { mapTilesFor } = await load();
    expect(mapTilesFor([{ latitude: 47.37, longitude: 8.54 }])).toEqual({ tiles: { kind: "openfreemap" }, maxBounds: undefined });
  });
});
