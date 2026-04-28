import { describe, it, expect, vi } from "vitest";
import {
  checkListingUrl,
  checkListings,
  urlIndicatesExpired,
} from "../listing-status";

function makeFetch(map: Record<string, number | "throw">) {
  return vi.fn(async (url: string | URL) => {
    const key = url.toString();
    const value = map[key];
    if (value === "throw") throw new Error("network");
    return { status: value } as Response;
  }) as unknown as typeof fetch;
}

describe("checkListingUrl", () => {
  it("returns true on 404", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 404 });
    expect(await checkListingUrl("https://x/listing", fetchImpl)).toBe(true);
  });

  it("returns true on 410", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 410 });
    expect(await checkListingUrl("https://x/listing", fetchImpl)).toBe(true);
  });

  it("returns false on 200", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 200 });
    expect(await checkListingUrl("https://x/listing", fetchImpl)).toBe(false);
  });

  it("returns null on network error", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": "throw" });
    expect(await checkListingUrl("https://x/listing", fetchImpl)).toBe(null);
  });

  it("returns null on 500", async () => {
    const fetchImpl = makeFetch({ "https://x/listing": 500 });
    expect(await checkListingUrl("https://x/listing", fetchImpl)).toBe(null);
  });
});

describe("checkListings", () => {
  it("checks each apartment and returns one result per item", async () => {
    const fetchImpl = makeFetch({
      "https://a": 200,
      "https://b": 404,
      "https://c": 500,
    });
    const items = [
      { id: 1, listingUrl: "https://a" },
      { id: 2, listingUrl: "https://b" },
      { id: 3, listingUrl: "https://c" },
    ];
    const results = await checkListings(items, fetchImpl, 2);
    const byId = new Map(results.map((r) => [r.apartmentId, r.gone]));
    expect(byId.get(1)).toBe(false);
    expect(byId.get(2)).toBe(true);
    expect(byId.get(3)).toBe(null);
  });

  it("handles empty input", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const results = await checkListings([], fetchImpl);
    expect(results).toEqual([]);
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
