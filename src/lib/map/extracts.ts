// Map data we serve ourselves (#339): one PMTiles file per country, read by
// MapLibre with range requests from this app's own origin, so no tile host
// learns which area a household looks at. A leaf: the download script, the
// next.config.ts check and the browser all read this list.
//
// Each file is built by .github/workflows/map-data.yml and attached to a
// GitHub release; the build downloads it into public/map-data/ and checks it
// against `sha256`. Refreshing a country = run the workflow, then replace its
// entry here (a new file name, so a browser never pairs a cached old index
// with new tiles).

export type Bounds = [west: number, south: number, east: number, north: number];

export interface MapExtract {
  id: string;
  // The area the file holds data for (Planetiler's input bounds). A
  // household whose points all lie inside gets this file, and the map does
  // not pan far outside it.
  bounds: Bounds;
  file: string;
  url: string;
  sha256: string;
  bytes: number;
}

export const MAP_DATA_DIR = "map-data";

const RELEASES = "https://github.com/brlauuu/flatpare/releases/download";

export const MAP_EXTRACTS: readonly MapExtract[] = [
  {
    id: "ch",
    bounds: [5.954418, 45.816418, 10.49584, 47.81126],
    file: "ch-2026-10-25.pmtiles",
    url: `${RELEASES}/map-data-2026-10-25/ch-2026-10-25.pmtiles`,
    sha256: "e0b9324ec77418de70e132f9fb4f150601a3047e853decc95892cabfe9831578",
    bytes: 225599605,
  },
];

export function extractPath(extract: MapExtract): string {
  return `/${MAP_DATA_DIR}/${extract.file}`;
}

// Which extracts the build put in place, inlined by next.config.ts as a
// comma-separated list of ids. Anything not in MAP_EXTRACTS is ignored.
export function availableExtracts(value: string | undefined): MapExtract[] {
  const ids = new Set((value ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  return MAP_EXTRACTS.filter((e) => ids.has(e.id));
}

function inside(bounds: Bounds, p: { latitude: number; longitude: number }): boolean {
  const [west, south, east, north] = bounds;
  return p.longitude >= west && p.longitude <= east && p.latitude >= south && p.latitude <= north;
}

// The extract that holds every point, or null when none does (the map then
// falls back to OpenFreeMap). With nothing placed yet the first extract is
// used: the map starts over Switzerland anyway.
export function chooseExtract(
  points: { latitude: number; longitude: number }[],
  available: readonly MapExtract[]
): MapExtract | null {
  if (points.length === 0) return available[0] ?? null;
  return available.find((e) => points.every((p) => inside(e.bounds, p))) ?? null;
}

// How far past an extract's edge the map may pan, in degrees, so a mark
// near the border is not pinned to the edge of the screen.
const PAN_MARGIN = 0.5;

export function panBounds(extract: MapExtract): [[number, number], [number, number]] {
  const [west, south, east, north] = extract.bounds;
  return [
    [west - PAN_MARGIN, south - PAN_MARGIN],
    [east + PAN_MARGIN, north + PAN_MARGIN],
  ];
}
