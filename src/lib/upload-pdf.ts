import { upload } from "@vercel/blob/client";
import { canonicalizePathname } from "@/lib/pathname";

// Picks between client-direct Blob upload (cloud, no serverless body limit)
// and multipart-to-server (local dev, no Blob token). Probes the upload-token
// route once per page load and caches the result. The bytes handed in are
// already sealed by src/components/household-data/pdf-files.ts — this module
// never sees a plaintext PDF and never names the content as one.

const UPLOAD_TOKEN_URL = "/api/files/upload-token";
const FILES_URL = "/api/files";

interface BlobModeProbe {
  enabled: boolean;
  // The caller's own household id, needed to mint blob keys under the
  // `households/<id>/` prefix that the upload-token route (and every
  // file-serving route) requires. Present whenever `enabled` is true.
  householdId?: number;
}

let blobModeProbe: Promise<BlobModeProbe> | null = null;

function probeBlobMode(): Promise<BlobModeProbe> {
  if (!blobModeProbe) {
    blobModeProbe = fetch(UPLOAD_TOKEN_URL, { method: "GET" })
      .then(async (r) => {
        if (!r.ok) return { enabled: false };
        const data = (await r.json()) as { householdId?: number };
        return { enabled: true, householdId: data.householdId };
      })
      .catch(() => ({ enabled: false }));
  }
  return blobModeProbe;
}

export function _resetBlobModeProbeForTests() {
  blobModeProbe = null;
}

// Stores sealed bytes as households/<hid>/<apartmentId>.pdf.enc and returns
// the app-relative URL that serves them back (/api/pdf/... or /api/uploads/...).
export async function uploadEncryptedFile(
  bytes: Uint8Array<ArrayBuffer>,
  apartmentId: string
): Promise<string> {
  const body = new Blob([bytes], { type: "application/octet-stream" });
  const probe = await probeBlobMode();

  if (probe.enabled && probe.householdId !== undefined) {
    // Canonicalize BEFORE requesting a token: the upload-token route
    // requires the pathname it receives to already be its own canonical
    // form (handleUpload signs whatever raw pathname the client sends).
    // A UUID-based name never changes under canonicalization, but the
    // invariant is cheap to keep and the server checks it anyway.
    const pathname = canonicalizePathname(
      `households/${probe.householdId}/${apartmentId}.pdf.enc`
    );
    const blob = await upload(pathname, body, {
      access: "private",
      handleUploadUrl: UPLOAD_TOKEN_URL,
      contentType: "application/octet-stream",
    });
    return `/api/pdf/${blob.pathname}`;
  }

  const formData = new FormData();
  formData.append("file", body, `${apartmentId}.pdf.enc`);
  formData.append("apartmentId", apartmentId);
  const res = await fetch(FILES_URL, { method: "POST", body: formData });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  const { path } = (await res.json()) as { path: string };
  return path;
}
