import { put, get } from "@vercel/blob";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const isCloud = !!process.env.BLOB_READ_WRITE_TOKEN;

// Stored paths are `households/<id>/<filename>`. The two file-serving routes
// compare this id against the session's household — without it, any member
// could read another household's listing PDFs by guessing a path.
export function householdIdFromStoredPath(pathname: string): number | null {
  if (pathname.includes("..")) return null;
  const segments = pathname.split("/");
  if (segments.length < 3) return null;
  if (segments[0] !== "households") return null;
  if (!/^\d+$/.test(segments[1])) return null;
  return Number(segments[1]);
}

export async function uploadFile(
  householdId: number,
  filename: string,
  file: File
): Promise<string> {
  const key = `households/${householdId}/${filename}`;

  if (isCloud) {
    // Private blobs — served back through the auth-gated /api/pdf proxy.
    const blob = await put(key, file, { access: "private" });
    return `/api/pdf/${blob.pathname}`;
  }

  // Local mode: write to ./uploads/households/<id>/, served back through
  // /api/uploads.
  const dir = path.join(UPLOADS_DIR, "households", String(householdId));
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/api/uploads/${key}`;
}

// Read a stored PDF back from the URL produced by `uploadFile`. Goes directly
// to blob/disk — server-side fetch() can't resolve the relative `/api/...`
// URLs we hand to clients.
export async function readStoredFile(storedUrl: string): Promise<Buffer> {
  if (storedUrl.startsWith("/api/pdf/")) {
    const pathname = storedUrl.slice("/api/pdf/".length);
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error(`Blob not found: ${pathname}`);
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  if (storedUrl.startsWith("/api/uploads/")) {
    const rel = decodeURIComponent(storedUrl.slice("/api/uploads/".length));
    if (householdIdFromStoredPath(rel) === null) {
      throw new Error("Refusing to read an unscoped upload path");
    }
    const resolved = path.resolve(UPLOADS_DIR, rel);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      throw new Error("Path escapes the uploads directory");
    }
    return readFile(resolved);
  }

  throw new Error(`Unrecognized stored URL: ${storedUrl}`);
}
