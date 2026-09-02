import { upload } from "@vercel/blob/client";

// Picks between client-direct Blob upload (cloud, no 4.5 MB limit) and
// multipart-to-server (local dev, no Blob token). Probes the upload-token
// route once per page load and caches the result.

const UPLOAD_TOKEN_URL = "/api/parse-pdf/upload-token";
const PARSE_URL = "/api/parse-pdf";

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

export async function uploadAndParsePdf(file: File): Promise<Response> {
  const probe = await probeBlobMode();
  if (probe.enabled && probe.householdId) {
    const pathname = `households/${probe.householdId}/${Date.now()}-${file.name}`;
    const blob = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: UPLOAD_TOKEN_URL,
      contentType: "application/pdf",
    });
    return fetch(PARSE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname: blob.pathname, filename: file.name }),
    });
  }

  const formData = new FormData();
  formData.append("file", file);
  return fetch(PARSE_URL, { method: "POST", body: formData });
}
