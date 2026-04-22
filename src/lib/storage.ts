import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
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
