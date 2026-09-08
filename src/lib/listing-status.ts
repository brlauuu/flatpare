import { assertPublicHttpUrl, type LookupFn } from "@/lib/safe-url";

const REQUEST_TIMEOUT_MS = 10_000;
// Each hop is re-validated, so this bounds work rather than exposure.
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Some listing sites encode the expired state in the URL itself (and/or
// block bot HEAD/GET probes), so a URL match is a stronger signal than the
// HTTP status code. Each entry: hostname suffix → predicate over the URL.
const EXPIRED_URL_PATTERNS: Array<{
  host: string;
  matches: (url: URL) => boolean;
}> = [
  // immoscout24.ch redirects expired ads to a quarter page with ?expired=<id>.
  {
    host: "immoscout24.ch",
    matches: (u) => u.searchParams.has("expired"),
  },
  // homegate.ch puts /expired/ in the path when an ad is gone.
  {
    host: "homegate.ch",
    matches: (u) => /\/expired(\/|$)/i.test(u.pathname),
  },
];

export function urlIndicatesExpired(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return EXPIRED_URL_PATTERNS.some(
    (p) => (host === p.host || host.endsWith(`.${p.host}`)) && p.matches(parsed)
  );
}

// One request to one already-validated URL, HEAD with a GET fallback (some
// listing sites block HEAD outright — the pre-E4 code relied on this too).
// Returns null when neither method produced a response; the caller turns
// that into the "could not tell" answer.
//
// Split out of checkListingUrl rather than inlined: the redirect walk added
// enough branching that enola flagged the combined function at cyclomatic
// complexity 18, and a security-critical function is the wrong place to
// leave that.
async function probeOnce(
  url: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<Response | null> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      return await fetchImpl(url, { method, redirect: "manual", signal });
    } catch {
      // try the next method
    }
  }
  return null;
}

// A validated URL, or null when the belt refused it (or it did not parse).
// Every refusal collapses to null so a blocked URL is indistinguishable from
// a timeout to the caller.
async function validated(raw: string, lookup?: LookupFn): Promise<URL | null> {
  try {
    return await assertPublicHttpUrl(raw, lookup);
  } catch {
    return null;
  }
}

// Where a redirect response points, once re-validated.
//   "expired" — the landing URL itself says the ad is gone
//   URL       — follow this next
//   null      — stop, we cannot tell
type Hop = URL | "expired" | null;

async function resolveRedirect(
  res: Response,
  current: URL,
  lookup?: LookupFn
): Promise<Hop> {
  const location = res.headers?.get("location");
  if (!location) return null;
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    return null;
  }
  // The landing URL may itself signal expiry: immoscout24 redirects gone ads
  // to a 200 quarter page with ?expired=<id>.
  if (urlIndicatesExpired(next.toString())) return "expired";
  return validated(next.toString(), lookup);
}

// The tri-state the endpoint returns, read off a non-redirect response.
function classify(res: Response): boolean | null {
  if (res.url && urlIndicatesExpired(res.url)) return true;
  if (res.status === 404 || res.status === 410) return true;
  if (res.status >= 200 && res.status < 400) return false;
  return null;
}

// Returns true when the listing is gone, false when it is still up, and null
// when we could not tell — including every refusal by the SSRF belt, so a
// blocked URL is indistinguishable from a timeout to the caller.
//
// Redirects are walked by hand (`redirect: "manual"`) rather than followed by
// fetch. `redirect: "follow"` validates only the URL we started with, so a
// public host answering 302 -> http://169.254.169.254/ would defeat a check
// made before the request (#199). Every hop goes back through
// assertPublicHttpUrl.
export async function checkListingUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
  lookup?: LookupFn
): Promise<boolean | null> {
  if (urlIndicatesExpired(url)) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let current = await validated(url, lookup);

    for (let hop = 0; current && hop <= MAX_REDIRECTS; hop++) {
      const res = await probeOnce(current, fetchImpl, controller.signal);
      if (!res) return null;
      if (!REDIRECT_STATUSES.has(res.status)) return classify(res);

      const next = await resolveRedirect(res, current, lookup);
      if (next === "expired") return true;
      current = next;
    }
    return null; // refused, or too many redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
