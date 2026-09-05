// Pure, dependency-free pathname helpers shared between server routes and
// client code (src/lib/upload-pdf.ts runs in the browser, so this module
// must not pull in "fs" or "@vercel/blob" the way src/lib/storage.ts does).

// Canonicalize a pathname the same way @vercel/blob's get() resolves one
// internally: string-interpolate into a URL and let the WHATWG parser
// collapse percent-encoded dot segments ("%2e%2e" -> "..", then resolved
// away). Any caller that checks a pathname's household and then uses that
// pathname for a blob operation MUST check this canonical form, not the
// raw input — checking one string and using another is exactly how a
// prior confirmed bypass in this codebase worked.
//
// Note this also re-serializes the path per WHATWG URL rules: a raw space
// becomes "%20", non-ASCII becomes UTF-8 percent-encoding, etc. That's why
// upload-pdf.ts canonicalizes client-side before ever requesting a token —
// so the pathname it sends is already stable under this function, and the
// server-side "is this pathname already canonical" check downstream
// doesn't reject ordinary filenames with spaces or accents.
export function canonicalizePathname(pathname: string): string {
  return new URL(`https://x/${pathname}`).pathname.slice(1);
}

// True if any path segment still carries a "%" after decoding.
//
// `/api/pdf/[...path]` gets its segments pre-decoded exactly once by
// Next.js's own router (decodeURIComponent per segment, a REAL decode —
// unlike canonicalizePathname above, which only recognizes exact
// dot-segment patterns like "%2e%2e" and otherwise leaves percent-encoding
// untouched). That mismatch is exploitable: a DOUBLE-encoded dot segment
// ("%252e%252e") survives Next's single decode looking like an inert
// filename ("%2e%2e"), passes any check written against that string, and
// only turns into ".." at the next stage that decodes again — inside
// @vercel/blob's get(), which builds a fetch() URL and performs exactly
// that recognition pass. Two decodes, one visible to the check, one
// invisible to it, is the same "check one string, use another" shape as
// the bug this module was already patched for on the read side.
//
// The fix here is structural rather than another layer of decoding (which
// would just move the goalposts to triple-encoding): after Next's one
// real decode, a legitimate segment should have nothing left to decode. If
// a "%" is still present, refuse — whether it's residual encoding from an
// attacker's payload or a filename that genuinely contains a literal "%"
// (which was already unreadable through this route before this fix: keys
// are written with the raw filename with no percent-encoding, so a literal
// "%" never round-trips through a browser navigation's own encode/decode
// pass to begin with). This doesn't newly break anything — it turns a
// pre-existing "quietly 404s eventually" case into an explicit, immediate
// refusal, and closes the double-encoding gap by removing the assumption
// entirely instead of arguing about how many times something gets decoded.
export function hasResidualPercentEncoding(segments: string[]): boolean {
  return segments.some((s) => s.includes("%"));
}
