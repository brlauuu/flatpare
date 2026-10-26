// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { findLocalMapFile, mapDir, MapConfigError, parsePmtilesHeader, readMapMode, readMapSource } from "../map-config";
import { pmtilesHeader } from "./pmtiles-fixture";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "maps-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("readMapMode", () => {
  it("is OpenFreeMap when unset or empty — flatpare.com, and a dev server", () => {
    expect(readMapMode(undefined)).toBe("openfreemap");
    expect(readMapMode("")).toBe("openfreemap");
    expect(readMapMode(" openfreemap ")).toBe("openfreemap");
  });

  it("reads local", () => {
    expect(readMapMode("local")).toBe("local");
  });

  it("refuses anything else rather than guessing", () => {
    expect(() => readMapMode("osm")).toThrow(MapConfigError);
    expect(() => readMapMode("Local")).toThrow(/"openfreemap" or "local"/);
  });
});

describe("mapDir", () => {
  it("defaults to maps/", () => {
    expect(mapDir(undefined)).toBe("maps");
    expect(mapDir(" ")).toBe("maps");
    expect(mapDir("/srv/maps")).toBe("/srv/maps");
  });
});

describe("parsePmtilesHeader", () => {
  it("reads the bounds and centre", () => {
    expect(parsePmtilesHeader(pmtilesHeader([5.95, 45.81, 10.49, 47.81], [8.22, 46.81], 7))).toEqual({
      bounds: [5.95, 45.81, 10.49, 47.81],
      center: [8.22, 46.81],
      centerZoom: 7,
      maxZoom: 14,
    });
  });

  it("refuses a short file, another format, another version or empty bounds", () => {
    expect(parsePmtilesHeader(new Uint8Array(20))).toBeNull();
    const wrongMagic = pmtilesHeader([1, 1, 2, 2]);
    wrongMagic[0] = 0x58;
    expect(parsePmtilesHeader(wrongMagic)).toBeNull();
    const v2 = pmtilesHeader([1, 1, 2, 2]);
    v2[7] = 2;
    expect(parsePmtilesHeader(v2)).toBeNull();
    expect(parsePmtilesHeader(pmtilesHeader([2, 2, 2, 2]))).toBeNull();
  });
});

describe("findLocalMapFile", () => {
  it("finds the one .pmtiles file, ignoring others and hidden files", () => {
    writeFileSync(join(dir, "zurich.pmtiles"), "x");
    writeFileSync(join(dir, "README.md"), "x");
    writeFileSync(join(dir, ".partial.pmtiles"), "x");
    expect(findLocalMapFile(dir)).toEqual({ file: "zurich.pmtiles" });
  });

  it("says when there is none, several, or no folder", () => {
    expect(findLocalMapFile(dir)).toEqual({ problem: "missing" });
    expect(findLocalMapFile(join(dir, "nope"))).toEqual({ problem: "missing" });
    writeFileSync(join(dir, "a.pmtiles"), "x");
    writeFileSync(join(dir, "b.pmtiles"), "x");
    expect(findLocalMapFile(dir)).toEqual({ problem: "several" });
  });
});

describe("readMapSource", () => {
  it("is OpenFreeMap without looking at the folder", () => {
    expect(readMapSource("openfreemap", join(dir, "nope"))).toEqual({ mode: "openfreemap" });
  });

  it("describes the local file from its header", () => {
    writeFileSync(join(dir, "paris.pmtiles"), pmtilesHeader([2.2, 48.8, 2.5, 48.95], [2.35, 48.86], 11));
    expect(readMapSource("local", dir)).toEqual({
      mode: "local",
      file: "paris.pmtiles",
      bounds: [2.2, 48.8, 2.5, 48.95],
      center: [2.35, 48.86],
      zoom: 11,
    });
  });

  it("reports a missing, ambiguous or unreadable file instead of falling back", () => {
    expect(readMapSource("local", dir)).toEqual({ mode: "local", file: null, problem: "missing" });
    writeFileSync(join(dir, "junk.pmtiles"), "not a map");
    expect(readMapSource("local", dir)).toEqual({ mode: "local", file: null, problem: "unreadable" });
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "other.pmtiles"), "x");
    expect(readMapSource("local", dir)).toEqual({ mode: "local", file: null, problem: "several" });
  });
});
