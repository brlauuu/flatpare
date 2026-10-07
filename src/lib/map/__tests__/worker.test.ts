import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workerUrl } from "../worker";
import { copyMaplibreWorker } from "../copy-worker";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fakePackage(version: string, worker = "self.onmessage = () => {};") {
  const root = mkdtempSync(join(tmpdir(), "maplibre-"));
  dirs.push(root);
  const pkg = join(root, "node_modules", "maplibre-gl");
  mkdirSync(join(pkg, "dist"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "maplibre-gl", version }));
  writeFileSync(join(pkg, "dist", "maplibre-gl-worker.mjs"), worker);
  return { root, pkg, publicDir: join(root, "public") };
}

describe("workerUrl", () => {
  it("names the worker by version, so a new release is never served a cached old worker", () => {
    expect(workerUrl("6.13.0")).toBe("/maplibre/maplibre-gl-worker-6.13.0.mjs");
  });
});

describe("copyMaplibreWorker", () => {
  it("copies the installed worker to the path workerUrl names", () => {
    const { pkg, publicDir } = fakePackage("6.13.0", "worker-bytes");
    const out = copyMaplibreWorker(pkg, publicDir);
    expect(out).toBe(join(publicDir, "maplibre", "maplibre-gl-worker-6.13.0.mjs"));
    expect(readFileSync(out!, "utf8")).toBe("worker-bytes");
  });

  it("removes workers of other versions", () => {
    const { pkg, publicDir } = fakePackage("6.14.0");
    mkdirSync(join(publicDir, "maplibre"), { recursive: true });
    writeFileSync(join(publicDir, "maplibre", "maplibre-gl-worker-6.13.0.mjs"), "old");
    copyMaplibreWorker(pkg, publicDir);
    expect(existsSync(join(publicDir, "maplibre", "maplibre-gl-worker-6.13.0.mjs"))).toBe(false);
    expect(existsSync(join(publicDir, "maplibre", "maplibre-gl-worker-6.14.0.mjs"))).toBe(true);
  });

  it("returns null instead of throwing when the package is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "maplibre-"));
    dirs.push(root);
    expect(copyMaplibreWorker(join(root, "nope"), join(root, "public"))).toBeNull();
  });

  it("matches the real installed package", () => {
    const { publicDir } = fakePackage("0.0.0");
    const out = copyMaplibreWorker(join(process.cwd(), "node_modules", "maplibre-gl"), publicDir);
    const version = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8")).version;
    expect(out?.endsWith(workerUrl(version))).toBe(true);
  });
});
