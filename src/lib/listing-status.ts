export interface ListingCheckResult {
  apartmentId: number;
  gone: boolean | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;

export async function checkListingUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean | null> {
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
