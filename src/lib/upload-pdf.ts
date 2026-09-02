import { upload } from "@vercel/blob/client";
import { canonicalizePathname } from "@/lib/pathname";

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
  // householdId is only absent when the probe itself failed or reported
  // disabled — checked explicitly (rather than truthiness) so a
  // theoretical householdId of 0 wouldn't silently fall through to
  // multipart. Unreachable today: household ids come from
  // householdIdFromStoredPath's `[1-9]\d*` check, which never yields 0.
  if (probe.enabled && probe.householdId !== undefined) {
    // Canonicalize BEFORE requesting a token, not after — the upload-token
    // route requires the pathname it receives to already be its own
    // canonical form (see the comment there for why: handleUpload signs
    // whatever raw pathname the client sends, so the server can't fix this
    // up for us). canonicalizePathname also percent-encodes ordinary
    // characters like spaces and accents, so doing it once here — and
    // using the *same* resulting string for both the token request and
    // the actual upload() call below — keeps the two in lockstep. If they
    // ever diverged, Vercel Blob's own pathname-mismatch check would
    // reject the upload outright, which is the right failure mode: no
    // path where a file silently lands somewhere other than what got
    // authorized.
    const pathname = canonicalizePathname(
      `households/${probe.householdId}/${Date.now()}-${file.name}`
    );
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

  // Multipart fallback: the whole file goes through the serverless
  // /api/parse-pdf body instead of a direct-to-Blob upload, which is
  // exactly the >4.5 MB serverless body limit the direct-upload path
  // exists to route around (see the file-uploads note in AGENTS.md). This
  // branch is only reachable today when the upload-token probe reports
  // disabled (no BLOB_READ_WRITE_TOKEN, e.g. local dev) or the fetch
  // itself failed — both of which mean cloud mode isn't active at all, so
  // there's no large-file path to protect here. But it's also the
  // fallback if `probe.enabled` were ever true with no `householdId` (not
  // reachable with the current server, which always includes it when
  // enabled): silently multiparting a large PDF in that case would trade
  // a clear error for a 413 further down the stack. If a future change
  // makes that combination reachable, this fallback needs to fail loudly
  // instead of falling through.
  const formData = new FormData();
  formData.append("file", file);
  return fetch(PARSE_URL, { method: "POST", body: formData });
}
