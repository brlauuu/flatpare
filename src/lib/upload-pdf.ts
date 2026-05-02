import { upload } from "@vercel/blob/client";

// Picks between client-direct Blob upload (cloud, no 4.5 MB limit) and
// multipart-to-server (local dev, no Blob token). Probes the upload-token
// route once per page load and caches the result.

const UPLOAD_TOKEN_URL = "/api/parse-pdf/upload-token";
const PARSE_URL = "/api/parse-pdf";

let blobModeProbe: Promise<boolean> | null = null;

function blobModeEnabled(): Promise<boolean> {
  if (!blobModeProbe) {
    blobModeProbe = fetch(UPLOAD_TOKEN_URL, { method: "GET" })
      .then((r) => r.ok)
      .catch(() => false);
  }
  return blobModeProbe;
}

export function _resetBlobModeProbeForTests() {
  blobModeProbe = null;
}

export async function uploadAndParsePdf(file: File): Promise<Response> {
  if (await blobModeEnabled()) {
    const pathname = `apartments/${Date.now()}-${file.name}`;
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
