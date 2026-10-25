import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAP_DATA_DIR, MAP_EXTRACTS, type MapExtract } from "./extracts";

// The build-side half of #339: put each country file into public/map-data/
// and tell next.config.ts which ones are there. Node only; the browser reads
// extracts.ts.

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

// The extracts present at the right size. Size, not hash: this runs from
// next.config.ts on every dev start, and the download already checked the
// hash before putting the file in place.
export function presentExtracts(publicDir: string, extracts: readonly MapExtract[] = MAP_EXTRACTS): string[] {
  return extracts
    .filter((e) => {
      try {
        return statSync(join(publicDir, MAP_DATA_DIR, e.file)).size === e.bytes;
      } catch {
        return false;
      }
    })
    .map((e) => e.id);
}

export type FetchResult = { id: string; status: "kept" | "downloaded" };

// Downloads every extract that is missing or wrong, verifies it against its
// sha256 before moving it into place, and removes files no entry names (an
// older refresh). Throws on a failed download or a hash mismatch; a partial
// file never lands under its real name.
export async function fetchExtracts(
  publicDir: string,
  extracts: readonly MapExtract[] = MAP_EXTRACTS,
  fetchImpl: typeof fetch = fetch,
  log: (line: string) => void = () => {}
): Promise<FetchResult[]> {
  const dir = join(publicDir, MAP_DATA_DIR);
  mkdirSync(dir, { recursive: true });
  const wanted = new Set(extracts.map((e) => e.file));
  for (const name of readdirSync(dir)) {
    if (!wanted.has(name)) rmSync(join(dir, name), { force: true });
  }

  const results: FetchResult[] = [];
  for (const e of extracts) {
    const target = join(dir, e.file);
    if (existsSync(target) && statSync(target).size === e.bytes && (await hashFile(target)) === e.sha256) {
      log(`[map-data] ${e.file} already in place`);
      results.push({ id: e.id, status: "kept" });
      continue;
    }
    log(`[map-data] downloading ${e.file} (${Math.round(e.bytes / 1e6)} MB)`);
    const partial = `${target}.partial`;
    try {
      const res = await fetchImpl(e.url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(partial));
      const actual = await hashFile(partial);
      if (actual !== e.sha256) throw new Error(`sha256 mismatch: got ${actual}`);
      renameSync(partial, target);
    } catch (err) {
      rmSync(partial, { force: true });
      throw new Error(`[map-data] ${e.file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    results.push({ id: e.id, status: "downloaded" });
  }
  return results;
}
