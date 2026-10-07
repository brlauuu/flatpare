import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { workerUrl } from "./worker";

// Copies MapLibre's worker from the installed package into public/, at the
// path workerUrl() names (#330). Run by next.config.ts, so it happens on
// every `next dev`, `next build` (Vercel and Docker alike) and `next start`
// and always matches the installed version. Workers of other versions are
// removed. Returns the written path, or null when the package cannot be read
// — the map then fails to load and says so, rather than the build failing.
export function copyMaplibreWorker(packageDir: string, publicDir: string): string | null {
  try {
    const { version } = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { version: string };
    const target = join(publicDir, ...workerUrl(version).split("/").filter(Boolean));
    const dir = join(publicDir, "maplibre");
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      if (join(dir, name) !== target) rmSync(join(dir, name), { force: true });
    }
    copyFileSync(join(packageDir, "dist", "maplibre-gl-worker.mjs"), target);
    return target;
  } catch {
    return null;
  }
}
