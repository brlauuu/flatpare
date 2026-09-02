import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { UnauthorizedError } from "@/lib/household";
import { requireHousehold } from "@/lib/session";
import { canonicalizePathname, householdIdFromStoredPath } from "@/lib/storage";

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
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) return notAuthenticated();
    throw e;
  }
  // Probe used by the client to decide between direct-upload and multipart
  // fallback. householdId is the caller's own — the client needs it to mint
  // blob keys under `households/<id>/`, the prefix the upload-token route
  // below (and the read routes) require.
  if (!blobConfigured()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  return NextResponse.json({ enabled: true, householdId });
}

export async function POST(request: Request) {
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
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
      // The @vercel/blob client-token API has no "allowed prefix" option —
      // handleUpload signs the token for whatever `pathname` the client
      // requested (see node_modules/@vercel/blob/dist/client.js: the raw
      // `pathname` destructured from the event payload is passed straight
      // to generateClientTokenFromReadWriteToken, unaffected by anything
      // this callback returns). So the constraint has to live here, before
      // signing: refuse to mint a token unless the pathname's canonical
      // form resolves to the caller's own household.
      //
      // Canonicalize BEFORE checking, exactly as readStoredFile does — a
      // prior confirmed bypass in this epic came from checking a raw
      // string and then using a normalized one for the real operation.
      // householdIdFromStoredPath is reused rather than re-implemented so
      // there is exactly one definition of what a household-scoped path
      // looks like.
      onBeforeGenerateToken: async (pathname) => {
        const canonical = canonicalizePathname(pathname);
        if (householdIdFromStoredPath(canonical) !== householdId) {
          throw new Error(
            "Refusing to mint an upload token outside the caller's household"
          );
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_PDF_BYTES,
          addRandomSuffix: false,
        };
      },
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
