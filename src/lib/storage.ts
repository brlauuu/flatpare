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
    const blob = await put(`apartments/${filename}`, file, {
      access: "public",
    });
    return blob.url;
  }

  // Local mode: write to ./uploads/
  await mkdir(UPLOADS_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(UPLOADS_DIR, filename);
  await writeFile(filePath, buffer);
  return `/api/uploads/${encodeURIComponent(filename)}`;
}
