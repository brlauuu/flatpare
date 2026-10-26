// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { GET, HEAD } from "../route";

let dir: string;
const BODY = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256));
const params = (file: string) => ({ params: Promise.resolve({ file }) });
const req = (range?: string) => new Request("http://x/map-data/zurich.pmtiles", { headers: range ? { range } : {} });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "maps-"));
  writeFileSync(join(dir, "zurich.pmtiles"), BODY);
  vi.stubEnv("FLATPARE_MAPS", "local");
  vi.stubEnv("FLATPARE_MAP_DIR", dir);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /map-data/[file]", () => {
  it("serves a byte range of the local file", async () => {
    const res = await GET(req("bytes=0-126"), params("zurich.pmtiles"));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-126/300");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BODY.subarray(0, 127));
  });

  it("serves the whole file without a range", async () => {
    const res = await GET(req(), params("zurich.pmtiles"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("300");
    expect((await res.arrayBuffer()).byteLength).toBe(300);
  });

  it("answers 416 for a range past the end", async () => {
    const res = await GET(req("bytes=400-"), params("zurich.pmtiles"));
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */300");
  });

  it("serves nothing but the one file, and nothing unless the map is local", async () => {
    expect((await GET(req(), params("other.pmtiles"))).status).toBe(404);
    expect((await GET(req(), params("../secret"))).status).toBe(404);
    vi.stubEnv("FLATPARE_MAPS", "openfreemap");
    expect((await GET(req(), params("zurich.pmtiles"))).status).toBe(404);
  });

  it("answers HEAD with the headers only", async () => {
    const res = await HEAD(req("bytes=10-19"), params("zurich.pmtiles"));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-length")).toBe("10");
    expect(res.body).toBeNull();
  });
});
