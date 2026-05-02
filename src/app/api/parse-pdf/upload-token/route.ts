import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Server route that mints short-lived client tokens so the browser can upload
// PDFs directly to Vercel Blob — bypassing the 4.5 MB serverless body limit
// that would otherwise reject anything over a few pages.

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function GET() {
  // Probe used by the client to decide between direct-upload and multipart fallback.
  if (!blobConfigured()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  return NextResponse.json({ enabled: true });
}

export async function POST(request: Request) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: "Blob storage not configured" },
      { status: 503 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: MAX_PDF_BYTES,
        addRandomSuffix: false,
      }),
      onUploadCompleted: async () => {
        // No-op: /api/parse-pdf reads the blob back when the client posts the
        // pathname for AI extraction.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload token error" },
      { status: 400 }
    );
  }
}
