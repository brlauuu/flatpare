import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/google", () => ({
  google: Object.assign((id: string) => ({ id }), {
    tools: {
      googleSearch: () => ({ kind: "google_search" }),
      enterpriseWebSearch: () => ({ kind: "enterprise_web_search" }),
    },
  }),
}));

import { generateText } from "ai";
import {
  candidateUrls,
  findListingUrl,
  listingSearchPrompt,
  pickListingUrl,
  repairListingUrl,
  type ListingHints,
} from "../find-listing";

const mockedGenerateText = vi.mocked(generateText);
// A public address, so the SSRF belt passes without a real DNS lookup.
const lookup = async () => [{ address: "142.250.0.1", family: 4 }];

const hints: ListingHints = {
  name: "3.5 Zimmer an ruhiger Lage",
  address: "Seestrasse 12, 8800 Thalwil",
  site: "homegate.ch",
  language: "de",
};

const ENV = ["AI_PROVIDER", "AI_ZERO_DATA_RETENTION", "AI_MODEL", "GOOGLE_GENERATIVE_AI_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  mockedGenerateText.mockReset();
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("listingSearchPrompt", () => {
  it("names the title, address, website and the listing's language", () => {
    const prompt = listingSearchPrompt(hints);
    expect(prompt).toContain("Title: 3.5 Zimmer an ruhiger Lage");
    expect(prompt).toContain("Address: Seestrasse 12, 8800 Thalwil");
    expect(prompt).toContain("Published on: homegate.ch");
    expect(prompt).toContain("listing's language (de)");
  });

  it("leaves out what the PDF did not say", () => {
    const prompt = listingSearchPrompt({ name: "Flat", address: null, site: null, language: null });
    expect(prompt).not.toMatch(/Address:|Published on:|language \(/);
  });
});

describe("candidateUrls", () => {
  it("tries the search results first, then the answered URL, each once", () => {
    const urls = candidateUrls("Here it is: https://www.homegate.ch/rent/123.", [
      { url: "https://flatfox.ch/en/flat/9/" },
      { url: "https://www.homegate.ch/rent/123" },
      { url: "ftp://example.com/x" },
      {},
    ]);
    expect(urls.map((u) => u.href)).toEqual([
      "https://flatfox.ch/en/flat/9/",
      "https://www.homegate.ch/rent/123",
    ]);
  });

  it("falls back to the answered URL, without trailing punctuation", () => {
    expect(candidateUrls("See https://www.homegate.ch/rent/123.", []).map((u) => u.href)).toEqual([
      "https://www.homegate.ch/rent/123",
    ]);
  });

  it("is empty when the model found nothing", () => {
    expect(candidateUrls("NONE", [])).toEqual([]);
  });
});

describe("pickListingUrl", () => {
  it("skips a link that is gone and keeps one that could not be checked", async () => {
    const check = vi.fn(async (url: string) => (url.includes("gone") ? true : null));
    const picked = await pickListingUrl(
      [new URL("https://homegate.ch/gone/1"), new URL("https://homegate.ch/rent/2")],
      { check }
    );
    expect(picked).toBe("https://homegate.ch/rent/2");
  });

  it("follows Google's grounding redirect to the listing, without fetching the listing itself", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "https://www.homegate.ch/rent/42" } })
    ) as unknown as typeof fetch;
    const check = vi.fn(async () => false);
    const picked = await pickListingUrl(
      [new URL("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc")],
      { check, fetchImpl, lookup }
    );
    expect(picked).toBe("https://www.homegate.ch/rent/42");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith("https://www.homegate.ch/rent/42");
  });

  it("refuses a grounding redirect to a private address", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const picked = await pickListingUrl(
      [new URL("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc")],
      { check: vi.fn(async () => false), fetchImpl, lookup: async () => [{ address: "10.0.0.1", family: 4 }] }
    );
    expect(picked).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("gives up on a grounding redirect that points nowhere", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    const picked = await pickListingUrl(
      [new URL("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc")],
      { check: vi.fn(async () => false), fetchImpl, lookup }
    );
    expect(picked).toBeNull();
  });
});

describe("findListingUrl", () => {
  it("uses the zero-retention enterprise search on the gateway, with zero data retention", async () => {
    process.env.AI_PROVIDER = "gateway";
    mockedGenerateText.mockResolvedValue({ text: "https://www.homegate.ch/rent/7", sources: [] } as never);
    const found = await findListingUrl(hints, { check: async () => false });
    expect(found).toBe("https://www.homegate.ch/rent/7");
    const call = mockedGenerateText.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(Object.keys(call.tools as object)).toEqual(["enterprise_web_search"]);
    expect(call.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
    expect(call.prompt).toContain("homegate.ch");
  });

  it("uses Google Search when self-hosted on Gemini", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    mockedGenerateText.mockResolvedValue({
      text: "NONE",
      sources: [{ type: "source", sourceType: "url", id: "1", url: "https://flatfox.ch/en/flat/1/" }],
    } as never);
    const found = await findListingUrl(hints, { check: async () => null });
    expect(found).toBe("https://flatfox.ch/en/flat/1/");
    const call = mockedGenerateText.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(Object.keys(call.tools as object)).toEqual(["google_search"]);
    expect(call.providerOptions).toBeUndefined();
  });

  it("does not search when no AI provider is configured", async () => {
    expect(await findListingUrl(hints)).toBeNull();
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });
});

describe("repairListingUrl", () => {
  it("keeps a working PDF link and does not search", async () => {
    const find = vi.fn();
    const out = await repairListingUrl("https://homegate.ch/rent/1", hints, find, async () => false);
    expect(out).toEqual({ listingUrl: "https://homegate.ch/rent/1", found: false });
    expect(find).not.toHaveBeenCalled();
  });

  it("keeps a link that could not be checked, without searching", async () => {
    const find = vi.fn();
    const out = await repairListingUrl("https://homegate.ch/rent/1", hints, find, async () => null);
    expect(out.found).toBe(false);
    expect(find).not.toHaveBeenCalled();
  });

  it("searches when the PDF has no link, and uses what it finds", async () => {
    const find = vi.fn(async () => "https://homegate.ch/rent/9");
    const check = vi.fn();
    const out = await repairListingUrl(null, hints, find, check);
    expect(out).toEqual({ listingUrl: "https://homegate.ch/rent/9", found: true });
    expect(find).toHaveBeenCalledWith(hints);
    expect(check).not.toHaveBeenCalled();
  });

  it("replaces a dead link with the one found", async () => {
    const out = await repairListingUrl("https://homegate.ch/expired/1", hints, async () => "https://homegate.ch/rent/2", async () => true);
    expect(out).toEqual({ listingUrl: "https://homegate.ch/rent/2", found: true });
  });

  it("keeps the dead link when the search finds nothing", async () => {
    const out = await repairListingUrl("https://homegate.ch/expired/1", hints, async () => null, async () => true);
    expect(out).toEqual({ listingUrl: "https://homegate.ch/expired/1", found: false });
  });

  it("keeps the PDF's link when the search fails, and logs no request content", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await repairListingUrl(
      null,
      hints,
      async () => {
        throw new Error("search failed for Seestrasse 12, 8800 Thalwil");
      },
      async () => true
    );
    expect(out).toEqual({ listingUrl: null, found: false });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("listing search failed");
    expect(logged).not.toContain("Seestrasse");
  });
});
