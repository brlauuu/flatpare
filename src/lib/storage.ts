import { put, get } from "@vercel/blob";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const isCloud = !!process.env.BLOB_READ_WRITE_TOKEN;

// Stored paths are `households/<id>/<filename>`. The two file-serving routes
// compare this id against the session's household — without it, any member
// could read another household's listing PDFs by guessing a path.
export function householdIdFromStoredPath(pathname: string): number | null {
  const segments = pathname.split("/");
  // Reject ".." as a path SEGMENT, not a substring — a legitimate filename
  // like "report..final.pdf" must stay readable.
  if (segments.includes("..")) return null;
  if (segments.length < 3) return null;
  if (segments[0] !== "households") return null;
  // No leading zeros: "007" must not alias household 7.
  if (!/^[1-9]\d*$/.test(segments[1])) return null;
  // Reject an encoded slash inside a filename segment. Filenames
  // legitimately containing "/" don't exist (no OS or browser file picker
  // allows it), so this costs nothing — but decoding "%2f" later could
  // fabricate an extra path separator that never went through this check,
  // which matters if whatever consumes this string next (a storage
  // backend's own key resolution, say) treats it hierarchically.
  if (segments.slice(2).some((s) => /%2f/i.test(s))) return null;
  return Number(segments[1]);
}

export async function uploadFile(
  householdId: number,
  filename: string,
  file: File
): Promise<string> {
  const key = `households/${householdId}/${filename}`;

  if (isCloud) {
    // Private blobs — served back through the auth-gated /api/pdf proxy.
    const blob = await put(key, file, { access: "private" });
    return `/api/pdf/${blob.pathname}`;
  }

  // Local mode: write to ./uploads/households/<id>/, served back through
  // /api/uploads.
  const dir = path.join(UPLOADS_DIR, "households", String(householdId));
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/api/uploads/${key}`;
}

// Read a stored PDF back from the URL produced by `uploadFile`. Goes directly
// to blob/disk — server-side fetch() can't resolve the relative `/api/...`
// URLs we hand to clients.
//
// `expectedHouseholdId` is a required positional parameter, not an optional
// check left to each caller. Ownership used to be verified only at the two
// file-serving routes — that per-call-site convention is exactly how a
// third caller (parse-pdf's JSON branch, which forwards a client-supplied
// `pathname` straight into this function) slipped through with no check at
// all. The asymmetry was the tell: the local branch validated the
// household prefix and the cloud branch didn't, so the same logical
// operation had different trust properties depending on whether
// BLOB_READ_WRITE_TOKEN happened to be set. Enforcing the check here, once,
// on both branches, means every caller goes through it, and a required
// parameter makes the compiler enumerate every future caller instead of
// relying on each one to remember.
export async function readStoredFile(
  storedUrl: string,
  expectedHouseholdId: number
): Promise<Buffer> {
  if (storedUrl.startsWith("/api/pdf/")) {
    const rawPathname = storedUrl.slice("/api/pdf/".length);
    // Canonicalize BEFORE checking or fetching. @vercel/blob's get()
    // builds a URL by string-interpolating the pathname and hands it to
    // fetch(), which WHATWG-parses it and collapses percent-encoded dot
    // segments ("%2e%2e" -> "..", then resolved away) that a literal
    // check on the raw string would miss entirely. Checking the raw
    // string and fetching the raw string are two different operations on
    // two copies of the same text that a URL parser reads differently —
    // that gap IS the vulnerability. So: parse once, right here, and use
    // nothing but the resulting `key` from this point on — the string we
    // check is required (by construction, it's the same variable) to be
    // the string we fetch.
    const key = new URL(`https://x/${rawPathname}`).pathname.slice(1);
    if (householdIdFromStoredPath(key) !== expectedHouseholdId) {
      throw new Error(
        "Refusing to read a file outside the caller's household"
      );
    }
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error(`Blob not found: ${key}`);
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  if (storedUrl.startsWith("/api/uploads/")) {
    const rel = decodeURIComponent(storedUrl.slice("/api/uploads/".length));
    if (householdIdFromStoredPath(rel) !== expectedHouseholdId) {
      throw new Error(
        "Refusing to read a file outside the caller's household"
      );
    }
    const resolved = path.resolve(UPLOADS_DIR, rel);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      // Unreachable in practice: the household-prefix check above already
      // rejects any ".." segment, so `resolved` can never leave UPLOADS_DIR.
      // Kept as defense in depth in case the prefix-parsing logic above
      // ever changes.
      throw new Error("Path escapes the uploads directory");
    }
    return readFile(resolved);
  }

  throw new Error(`Unrecognized stored URL: ${storedUrl}`);
}
