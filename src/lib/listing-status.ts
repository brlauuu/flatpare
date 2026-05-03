interface ListingCheckResult {
  apartmentId: number;
  gone: boolean | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;

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

export async function checkListingUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean | null> {
  if (urlIndicatesExpired(url)) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
    } catch {
      res = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }
    // After following redirects, the landing URL may itself signal expiry
    // (e.g. immoscout24 redirects 4xx-ish ads to a 200 quarter page with
    // ?expired=<id>). Check the final URL too.
    if (res.url && urlIndicatesExpired(res.url)) return true;
    if (res.status === 404 || res.status === 410) return true;
    if (res.status >= 200 && res.status < 400) return false;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkListings<T extends { id: number; listingUrl: string }>(
  items: T[],
  fetchImpl: typeof fetch = fetch,
  concurrency: number = CONCURRENCY
): Promise<ListingCheckResult[]> {
  const results: ListingCheckResult[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      const gone = await checkListingUrl(item.listingUrl, fetchImpl);
      results.push({ apartmentId: item.id, gone });
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
