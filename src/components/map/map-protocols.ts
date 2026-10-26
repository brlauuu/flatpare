import { addProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { GLYPH_PROTOCOL, glyphPath } from "@/lib/map/glyphs";
import { panBounds, type MapSource } from "@/lib/map/local-map";
import { OPENFREEMAP, selfTiles, type MapTiles } from "@/lib/map/style";

// Registers the two URL schemes a local map file needs (#339), once per page
// load: `pmtiles://` reads tiles out of the file with range requests, and GLYPH_PROTOCOL serves label fonts from public/map-fonts/,
// answering a range we do not ship with an empty set (see glyphs.ts).
// Imported only by household-map-inner.tsx, which loads MapLibre.

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

// The tiles the map reads, how far it may pan, and where it starts with
// nothing placed: anywhere on OpenFreeMap from Switzerland, near and at the
// middle of a local file. Only called with a usable source; a local choice
// without a file never reaches the map (household-map.tsx).
export function tilesFor(source: MapSource): {
  tiles: MapTiles;
  maxBounds?: [[number, number], [number, number]];
  empty?: { center: [number, number]; zoom: number };
} {
  if (source.mode === "local" && source.file) {
    return {
      tiles: selfTiles(window.location.origin, source.file),
      maxBounds: panBounds(source.bounds),
      empty: { center: source.center, zoom: source.zoom },
    };
  }
  return { tiles: OPENFREEMAP };
}
