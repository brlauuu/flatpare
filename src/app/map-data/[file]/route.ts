import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { findLocalMapFile, mapDir, readMapMode } from "@/lib/map/map-config";
import { parseByteRange } from "@/lib/map/byte-range";

// Serves a self-hoster's own map file (#339) from their `maps/` folder, in
// the byte ranges MapLibre asks for. Only when FLATPARE_MAPS=local, and only
// the one file the map page was told about; anything else is a 404. It is
// OpenStreetMap data, nothing of anyone's, so the proxy does not gate it
// (`map-data/` in the src/proxy.ts matcher) and the many range requests a
// map makes do not each run auth().

const NOT_FOUND = () => new Response("Not found", { status: 404 });

function serve(request: Request, file: string, method: "GET" | "HEAD"): Response {
  const dir = mapDir();
  if (readMapMode() !== "local") return NOT_FOUND();
  const found = findLocalMapFile(dir);
  if (!("file" in found) || found.file !== file) return NOT_FOUND();
  const path = join(dir, found.file);
  let size: number;
  let mtime: number;
  try {
    const stat = statSync(path);
    size = stat.size;
    mtime = stat.mtimeMs;
  } catch {
    return NOT_FOUND();
  }
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": "application/octet-stream",
    // The self-hoster may replace the file; the ETag changes with it, and
    // the PMTiles reader notices a changed ETag and starts over.
    ETag: `"${size.toString(16)}-${Math.floor(mtime).toString(16)}"`,
    "Cache-Control": "public, max-age=3600",
  });
  const range = parseByteRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range === "none" ? { start: 0, end: size - 1 } : range;
  headers.set("Content-Length", String(end - start + 1));
  if (range !== "none") headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  const status = range === "none" ? 200 : 206;
  if (method === "HEAD" || size === 0) return new Response(null, { status, headers });
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  return serve(request, (await params).file, "GET");
}

export async function HEAD(request: Request, { params }: { params: Promise<{ file: string }> }) {
  return serve(request, (await params).file, "HEAD");
}
