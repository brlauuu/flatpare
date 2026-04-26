import { put, get } from "@vercel/blob";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const isCloud = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function uploadFile(
  filename: string,
  file: File
): Promise<string> {
  if (isCloud) {
    // Private blobs — served back through the auth-gated /api/pdf proxy.
    const blob = await put(`apartments/${filename}`, file, {
      access: "private",
    });
    return `/api/pdf/${blob.pathname}`;
  }

  // Local mode: write to ./uploads/, served back through /api/uploads.
  await mkdir(UPLOADS_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(UPLOADS_DIR, filename);
  await writeFile(filePath, buffer);
  return `/api/uploads/${encodeURIComponent(filename)}`;
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
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  if (storedUrl.startsWith("/api/uploads/")) {
    const filename = decodeURIComponent(
      storedUrl.slice("/api/uploads/".length)
    );
    return readFile(path.join(UPLOADS_DIR, filename));
  }

  throw new Error(`Unrecognized stored URL: ${storedUrl}`);
}
