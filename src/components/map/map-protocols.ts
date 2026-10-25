import { addProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { availableExtracts, panBounds } from "@/lib/map/extracts";
import { GLYPH_PROTOCOL, glyphPath } from "@/lib/map/glyphs";
import { pickTiles } from "@/lib/map/style";

// Registers the two URL schemes our own map data needs (#339), once per page
// load: `pmtiles://` reads tiles out of the country file with range
// requests, and GLYPH_PROTOCOL serves label fonts from public/map-fonts/,
// answering a range we do not ship with an empty set (see glyphs.ts).
// Imported only by the *-map-inner components, which load MapLibre.

let registered = false;

export function registerMapProtocols(): void {
  if (registered) return;
  registered = true;
  addProtocol("pmtiles", new Protocol().tile);
  addProtocol(GLYPH_PROTOCOL, async (params, abortController) => {
    const path = glyphPath(params.url);
    if (!path) return { data: new ArrayBuffer(0) };
    const res = await fetch(path, { signal: abortController.signal });
    if (!res.ok) return { data: new ArrayBuffer(0) };
    return { data: await res.arrayBuffer() };
  });
}

// The tiles a map with these points reads, and how far it may pan: near
// our file when it reads one, anywhere on OpenFreeMap. FLATPARE_MAP_EXTRACTS
// is inlined by next.config.ts: the files present in this build.
export function mapTilesFor(points: { latitude: number; longitude: number }[]) {
  const { tiles, extract } = pickTiles(points, availableExtracts(process.env.FLATPARE_MAP_EXTRACTS), window.location.origin);
  return { tiles, maxBounds: extract ? panBounds(extract) : undefined };
}
