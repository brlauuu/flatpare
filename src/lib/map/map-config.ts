import { openSync, readSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Bounds, MapSource } from "./local-map";

// The self-hoster's map choice (#339), read on the server. Node only; the
// browser gets the resulting MapSource as a prop.

export type MapMode = "openfreemap" | "local";

export class MapConfigError extends Error {
  constructor(value: string) {
    super(`FLATPARE_MAPS must be "openfreemap" or "local", got "${value}"`);
    this.name = "MapConfigError";
  }
}

// Unset or empty is OpenFreeMap: that is flatpare.com, and a `npm run dev`
// without the variable. The Docker image refuses to start without it
// (docker-entrypoint.sh), which is where a self-hoster makes the choice.
export function readMapMode(value: string | undefined = process.env.FLATPARE_MAPS): MapMode {
  const v = (value ?? "").trim();
  if (v === "" || v === "openfreemap") return "openfreemap";
  if (v === "local") return "local";
  throw new MapConfigError(v);
}

export function mapDir(value: string | undefined = process.env.FLATPARE_MAP_DIR): string {
  return value?.trim() || "maps";
}

export interface PmtilesHeader {
  bounds: Bounds;
  center: [number, number];
  centerZoom: number;
  maxZoom: number;
}

const HEADER_BYTES = 127;

// The fixed 127-byte PMTiles v3 header: "PMTiles", version 3, then
// little-endian fields; bounds and centre are degrees x 1e7 from byte 102.
export function parsePmtilesHeader(bytes: Uint8Array): PmtilesHeader | null {
  if (bytes.length < HEADER_BYTES) return null;
  if (new TextDecoder().decode(bytes.subarray(0, 7)) !== "PMTiles" || bytes[7] !== 3) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const deg = (offset: number) => view.getInt32(offset, true) / 1e7;
  const bounds: Bounds = [deg(102), deg(106), deg(110), deg(114)];
  if (!(bounds[0] < bounds[2] && bounds[1] < bounds[3])) return null;
  return { bounds, center: [deg(119), deg(123)], centerZoom: bytes[118], maxZoom: bytes[101] };
}

// The one .pmtiles file in the folder, or why there is not exactly one.
export function findLocalMapFile(dir: string): { file: string } | { problem: "missing" | "several" } {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".pmtiles") && !n.startsWith("."));
  } catch {
    return { problem: "missing" };
  }
  if (names.length === 0) return { problem: "missing" };
  if (names.length > 1) return { problem: "several" };
  return { file: names[0] };
}

function readHeader(path: string): PmtilesHeader | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buf = new Uint8Array(HEADER_BYTES);
    const read = readSync(fd, buf, 0, HEADER_BYTES, 0);
    return parsePmtilesHeader(buf.subarray(0, read));
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export function readMapSource(mode: MapMode = readMapMode(), dir: string = mapDir()): MapSource {
  if (mode === "openfreemap") return { mode };
  const found = findLocalMapFile(dir);
  if ("problem" in found) return { mode, file: null, problem: found.problem };
  const header = readHeader(join(dir, found.file));
  if (!header) return { mode, file: null, problem: "unreadable" };
  return { mode, file: found.file, bounds: header.bounds, center: header.center, zoom: header.centerZoom };
}
