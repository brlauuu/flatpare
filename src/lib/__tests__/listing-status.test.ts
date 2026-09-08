import { describe, it, expect, vi } from "vitest";
import {
  checkListingUrl,
  urlIndicatesExpired,
} from "../listing-status";

// Every host in these tests resolves to one public address, so the SSRF belt
// (src/lib/safe-url.ts) lets them through; the belt itself is tested there
// and in the "SSRF belt" block below.
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function makeFetch(map: Record<string, number | "throw">) {
  return vi.fn(async (url: string | URL) => {
    const key = url.toString();
    const value = map[key];
    if (value === "throw") throw new Error("network");
    return new Response(null, { status: value });
  }) as unknown as typeof fetch;
}

describe("checkListingUrl", () => {
  it("returns true on 404", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 404 });
    expect(await checkListingUrl("https://x/listing", fetchImpl, publicLookup)).toBe(true);
  });

  it("returns true on 410", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 410 });
    expect(await checkListingUrl("https://x/listing", fetchImpl, publicLookup)).toBe(true);
  });

  it("returns false on 200", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 200 });
    expect(await checkListingUrl("https://x/listing", fetchImpl, publicLookup)).toBe(false);
  });

  it("returns null on network error", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": "throw" });
    expect(await checkListingUrl("https://x/listing", fetchImpl, publicLookup)).toBe(null);
  });

  it("returns null on 500", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 500 });
    expect(await checkListingUrl("https://x/listing", fetchImpl, publicLookup)).toBe(null);
  });
});

describe("checkListingUrl SSRF belt (#199)", () => {
  it("refuses a private address without fetching at all", async () => {
    const fetchImpl = vi.fn();
    for (const raw of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:9200/_cat/indices",
      "http://10.0.0.5/admin",
      "http://[::1]:8080/",
    ]) {
      expect(
        await checkListingUrl(raw, fetchImpl as unknown as typeof fetch, publicLookup),
        raw
      ).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-http scheme without fetching", async () => {
    const fetchImpl = vi.fn();
    expect(
      await checkListingUrl("file:///etc/passwd", fetchImpl as unknown as typeof fetch, publicLookup)
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a public hostname that resolves into a private range", async () => {
    const fetchImpl = vi.fn();
    const privateLookup = async () => [{ address: "192.168.1.10", family: 4 }];
    expect(
      await checkListingUrl(
        "https://internal.example.com/ad",
        fetchImpl as unknown as typeof fetch,
        privateLookup
      )
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not follow a redirect into a private address", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1:9200/" } })
    ) as unknown as typeof fetch;
    expect(
      await checkListingUrl("https://example.com/ad/1", fetchImpl, publicLookup)
    ).toBeNull();
    // The first hop was fetched; the second was refused before any request.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect between public hosts and reports the final status", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) =>
      url.toString() === "https://example.com/ad/1"
        ? new Response(null, { status: 301, headers: { location: "https://example.org/ad/1" } })
        : new Response(null, { status: 404 })
    ) as unknown as typeof fetch;
    expect(await checkListingUrl("https://example.com/ad/1", fetchImpl, publicLookup)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up rather than looping on a redirect cycle", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://example.com/loop" } })
    ) as unknown as typeof fetch;
    expect(await checkListingUrl("https://example.com/loop", fetchImpl, publicLookup)).toBeNull();
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("treats a redirect to an expired-marker URL as gone", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://www.immoscout24.ch/en/x?expired=4003084910" },
        })
    ) as unknown as typeof fetch;
    expect(await checkListingUrl("https://example.com/ad/1", fetchImpl, publicLookup)).toBe(true);
  });

  it("returns null when a redirect carries no location header", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302 })) as unknown as typeof fetch;
    expect(await checkListingUrl("https://example.com/ad/1", fetchImpl, publicLookup)).toBeNull();
  });
});

describe("urlIndicatesExpired", () => {
  it("flags immoscout24 URLs with ?expired=<id>", () => {
    expect(
      urlIndicatesExpired(
        "https://www.immoscout24.ch/en/flat/rent/quarter-vorstaedte-basel?expired=4003084910"
      )
    ).toBe(true);
  });

  it("does not flag normal immoscout24 URLs", () => {
    expect(
      urlIndicatesExpired("https://www.immoscout24.ch/en/d/4003084910")
    ).toBe(false);
  });

  it("flags homegate.ch URLs containing /expired/", () => {
    expect(
      urlIndicatesExpired("https://www.homegate.ch/expired/12345")
    ).toBe(true);
  });

  it("returns false for unrelated hosts", () => {
    expect(
      urlIndicatesExpired("https://example.com/listing?expired=1")
    ).toBe(false);
  });

  it("returns false for malformed URLs", () => {
    expect(urlIndicatesExpired("not a url")).toBe(false);
  });
});

describe("checkListingUrl with URL-pattern heuristic", () => {
  it("returns true for immoscout24 expired URLs without making an HTTP call", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await checkListingUrl(
      "https://www.immoscout24.ch/en/flat/rent/quarter-vorstaedte-basel?expired=4003084910",
      fetchImpl
    );
    expect(result).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns true when redirect lands on an expired URL even with 200", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      url: "https://www.immoscout24.ch/en/flat/rent/foo?expired=42",
    }) as Response) as unknown as typeof fetch;
    expect(
      await checkListingUrl("https://www.immoscout24.ch/en/d/42", fetchImpl)
    ).toBe(true);
  });
});
