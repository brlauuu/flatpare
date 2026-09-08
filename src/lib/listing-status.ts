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
    let current: URL;
    try {
      current = await assertPublicHttpUrl(url, lookup);
    } catch {
      return null;
    }

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response;
      try {
        res = await fetchImpl(current, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        // Some listing sites block HEAD outright; GET is the fallback the
        // pre-E4 code already relied on.
        try {
          res = await fetchImpl(current, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
          });
        } catch {
          return null;
        }
      }

      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers?.get("location");
        if (!location) return null;
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return null;
        }
        // The landing URL may itself signal expiry (immoscout24 redirects
        // gone ads to a 200 quarter page with ?expired=<id>).
        if (urlIndicatesExpired(next.toString())) return true;
        try {
          current = await assertPublicHttpUrl(next.toString(), lookup);
        } catch {
          return null;
        }
        continue;
      }

      if (res.url && urlIndicatesExpired(res.url)) return true;
      if (res.status === 404 || res.status === 410) return true;
      if (res.status >= 200 && res.status < 400) return false;
      return null;
    }
    return null; // too many redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
