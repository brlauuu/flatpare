import type { StyleSpecification } from "maplibre-gl";
import { localMapPath } from "./local-map";
import { SELF_GLYPHS_URL } from "./glyphs";

// The map's look (#330): a printed street map — streets, water, parks,
// street and neighbourhood names — and nothing else. Buildings, house
// numbers and points of interest are left out on purpose. There is no
// background layer: the canvas stays transparent and the page's grid
// (`map-grid-bg` in globals.css) shows through.
//
// Tiles come from OpenFreeMap, or, on a self-hosted instance that chose
// FLATPARE_MAPS=local, from its own PMTiles file (#339, local-map.ts). Both
// use the OpenMapTiles schema, so the layers are the same and only the
// source and the glyphs differ.

export type MapTheme = "light" | "dark";

export const TILES_URL = "https://tiles.openfreemap.org/planet";
export const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// Map-only colours, fixed like the old Leaflet pins (#324): tiles are not
// themed by tokens. The household's own marks use theme tokens instead.
const PALETTE = {
  light: { ink: "#000000", water: "#cfe0ff", waterLine: "#7aa0e6", park: "#e3f1dc", minor: "#9a9a9a", label: "#333333", halo: "#ffffff" },
  dark: { ink: "#ffffff", water: "#16304d", waterLine: "#3a6aa0", park: "#1b2a16", minor: "#8a8a8a", label: "#cfcfcf", halo: "#0d0d0d" },
} as const;

// A local file: read through the pmtiles protocol (registered by the map
// component) from this app's origin, labels from public/map-fonts/.
// OpenFreeMap: their tiles and their fonts, which also cover scripts we do
// not ship — that host sees the area on screen anyway.
export type MapTiles = { kind: "self"; url: string } | { kind: "openfreemap" };

export const OPENFREEMAP: MapTiles = { kind: "openfreemap" };

// The credit the data's licence requires. OpenFreeMap's TileJSON carries its
// own; a local file gets this one.
export const SELF_ATTRIBUTION =
  '<a href="https://openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';

export function selfTiles(origin: string, file: string): MapTiles {
  return { kind: "self", url: `pmtiles://${origin}${localMapPath(file)}` };
}

const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];
const ITALIC = ["Noto Sans Italic"];

export function mapStyle(theme: MapTheme, tiles: MapTiles): StyleSpecification {
  const c = PALETTE[theme];
  const self = tiles.kind === "self";
  const roundLine = { "line-cap": "round", "line-join": "round" } as const;
  return {
    version: 8,
    glyphs: self ? SELF_GLYPHS_URL : GLYPHS_URL,
    sources: {
      omt: self ? { type: "vector", url: tiles.url, attribution: SELF_ATTRIBUTION } : { type: "vector", url: TILES_URL },
    },
    layers: [
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": c.park } },
      {
        id: "landcover-green", type: "fill", source: "omt", "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["grass", "wood"]]],
        paint: { "fill-color": c.park, "fill-opacity": 0.8 },
      },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c.water } },
      {
        id: "waterway", type: "line", source: "omt", "source-layer": "waterway",
        filter: ["!=", ["get", "class"], "river"],
        paint: { "line-color": c.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 2.5] },
      },
      {
        id: "rail", type: "line", source: "omt", "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": c.minor, "line-opacity": 0.6, "line-width": 0.8, "line-dasharray": [3, 2] },
      },
      {
        id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 13,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service"]]],
        layout: roundLine,
        paint: { "line-color": c.minor, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 17, 2] },
      },
      {
        id: "road-mid", type: "line", source: "omt", "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["tertiary", "secondary"]]],
        layout: roundLine,
        paint: { "line-color": c.ink, "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 17, 3.5] },
      },
      {
        id: "road-major", type: "line", source: "omt", "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["primary", "trunk", "motorway"]]],
        layout: roundLine,
        paint: { "line-color": c.ink, "line-opacity": 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 17, 3.5] },
      },
      {
        id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name",
        layout: { "text-field": ["get", "name"], "text-font": ITALIC, "text-size": 13 },
        paint: { "text-color": c.waterLine, "text-halo-color": c.halo, "text-halo-width": 1.5 },
      },
      {
        id: "waterway-name", type: "symbol", source: "omt", "source-layer": "waterway",
        layout: { "text-field": ["get", "name"], "text-font": ITALIC, "text-size": 13, "symbol-placement": "line" },
        paint: { "text-color": c.waterLine, "text-halo-color": c.halo, "text-halo-width": 1.5 },
      },
      {
        id: "street-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 14,
        layout: {
          "text-field": ["get", "name"], "text-font": REGULAR, "symbol-placement": "line",
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 17, 13],
        },
        paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.5 },
      },
      {
        id: "neighbourhood", type: "symbol", source: "omt", "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["suburb", "quarter", "neighbourhood"]]],
        layout: {
          "text-field": ["upcase", ["get", "name"]], "text-font": BOLD, "text-letter-spacing": 0.15,
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 14],
        },
        paint: { "text-color": c.ink, "text-opacity": 0.45, "text-halo-color": c.halo, "text-halo-width": 1.5 },
      },
      {
        id: "city", type: "symbol", source: "omt", "source-layer": "place", maxzoom: 13,
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: { "text-field": ["get", "name"], "text-font": BOLD, "text-size": 16 },
        paint: { "text-color": c.ink, "text-halo-color": c.halo, "text-halo-width": 2 },
      },
    ],
  };
}

