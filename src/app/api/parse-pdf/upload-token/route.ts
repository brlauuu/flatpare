import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { UnauthorizedError } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

function notAuthenticated() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

// Server route that mints short-lived client tokens so the browser can upload
// PDFs directly to Vercel Blob — bypassing the 4.5 MB serverless body limit
// that would otherwise reject anything over a few pages.

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function GET() {
  try {
    await requireHousehold();
  } catch (e) {
    if (e instanceof UnauthorizedError) return notAuthenticated();
    throw e;
  }
  // Probe used by the client to decide between direct-upload and multipart fallback.
  if (!blobConfigured()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  return NextResponse.json({ enabled: true });
}

export async function POST(request: Request) {
  try {
    await requireHousehold();
  } catch (e) {
    if (e instanceof UnauthorizedError) return notAuthenticated();
    throw e;
  }
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
      // NOTE: the minted token still carries no pathname constraint, so a
      // signed-in caller can choose the blob key. That is ruling R6's Task 4b
      // (client key generation in src/lib/upload-pdf.ts must move under
      // `households/<id>/` first); constraining it here alone would reject the
      // keys the current client mints and break every cloud upload.
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
