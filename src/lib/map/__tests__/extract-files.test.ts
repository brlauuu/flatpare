// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fetchExtracts, presentExtracts } from "../extract-files";
import type { MapExtract } from "../extracts";

const BYTES = new TextEncoder().encode("pretend pmtiles bytes");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const EXTRACT: MapExtract = {
  id: "ch",
  bounds: [5.9, 45.8, 10.5, 47.8],
  file: "ch-2026-10-25.pmtiles",
  url: "https://example.test/ch-2026-10-25.pmtiles",
  sha256: SHA,
  bytes: BYTES.length,
};

let dir: string;
const file = (name = EXTRACT.file) => join(dir, "map-data", name);
const ok = () => vi.fn(async () => new Response(BYTES));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "map-data-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("fetchExtracts", () => {
  it("downloads, verifies and moves the file into place", async () => {
    const fetchImpl = ok();
    expect(await fetchExtracts(dir, [EXTRACT], fetchImpl)).toEqual([{ id: "ch", status: "downloaded" }]);
    expect(fetchImpl).toHaveBeenCalledWith(EXTRACT.url);
    expect(new Uint8Array(readFileSync(file()))).toEqual(BYTES);
  });

  it("keeps a file already in place without downloading", async () => {
    await fetchExtracts(dir, [EXTRACT], ok());
    const fetchImpl = ok();
    expect(await fetchExtracts(dir, [EXTRACT], fetchImpl)).toEqual([{ id: "ch", status: "kept" }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("replaces a file of the right size but the wrong content", async () => {
    mkdirSync(join(dir, "map-data"), { recursive: true });
    writeFileSync(file(), new Uint8Array(BYTES.length));
    expect(await fetchExtracts(dir, [EXTRACT], ok())).toEqual([{ id: "ch", status: "downloaded" }]);
    expect(new Uint8Array(readFileSync(file()))).toEqual(BYTES);
  });

  it("refuses a download whose hash does not match, leaving nothing behind", async () => {
    const fetchImpl = vi.fn(async () => new Response("tampered"));
    await expect(fetchExtracts(dir, [EXTRACT], fetchImpl)).rejects.toThrow(/sha256 mismatch/);
    expect(readdirSync(join(dir, "map-data"))).toEqual([]);
  });

  it("fails on an HTTP error", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 }));
    await expect(fetchExtracts(dir, [EXTRACT], fetchImpl)).rejects.toThrow(/HTTP 404/);
    expect(existsSync(file())).toBe(false);
  });

  it("removes files from an older refresh", async () => {
    mkdirSync(join(dir, "map-data"), { recursive: true });
    writeFileSync(file("ch-2025-01-01.pmtiles"), "old");
    await fetchExtracts(dir, [EXTRACT], ok());
    expect(readdirSync(join(dir, "map-data"))).toEqual([EXTRACT.file]);
  });
});

describe("presentExtracts", () => {
  it("lists the files present at their expected size", async () => {
    expect(presentExtracts(dir, [EXTRACT])).toEqual([]);
    await fetchExtracts(dir, [EXTRACT], ok());
    expect(presentExtracts(dir, [EXTRACT])).toEqual(["ch"]);
    writeFileSync(file(), "short");
    expect(presentExtracts(dir, [EXTRACT])).toEqual([]);
  });
});
