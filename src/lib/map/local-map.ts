// What the map needs to know about the map data (#339), shared by the
// server, which reads it (map-config.ts), and the browser, which draws it.
// A leaf with no imports, so the client bundle carries no file-system code.
//
// flatpare.com and a self-hoster who chose `FLATPARE_MAPS=openfreemap` read
// OpenFreeMap. A self-hoster who chose `local` serves one PMTiles file from
// their own `maps/` folder and the map contacts no one: areas the file does
// not cover show the grid and the marks, nothing else.

export type Bounds = [west: number, south: number, east: number, north: number];

export const MAP_DATA_ROUTE = "/map-data";

export type MapSource =
  | { mode: "openfreemap" }
  | { mode: "local"; file: string; bounds: Bounds; center: [number, number]; zoom: number }
  // `local` was chosen but there is no usable file: the page says so.
  | { mode: "local"; file: null; problem: "missing" | "several" | "unreadable" };

export function localMapPath(file: string): string {
  return `${MAP_DATA_ROUTE}/${encodeURIComponent(file)}`;
}

// How far past the file's edge the map may pan, in degrees, so a mark near
// the edge is not pinned to the side of the screen.
const PAN_MARGIN = 0.5;

export function panBounds(bounds: Bounds): [[number, number], [number, number]] {
  const [west, south, east, north] = bounds;
  return [
    [west - PAN_MARGIN, south - PAN_MARGIN],
    [east + PAN_MARGIN, north + PAN_MARGIN],
  ];
}
