import { describe, it, expect, vi, afterEach } from "vitest";
import { checkListing, distanceBetween, geocodeAddress, ParsePdfError, parsePdf } from "../process-client";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("process-client", () => {
  it("geocodeAddress posts the address", async () => {
    const fetchMock = vi.fn(async () => json({ lat: 1, lng: 2, postcode: "8000" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await geocodeAddress("X 1, Zürich")).toEqual({ lat: 1, lng: 2, postcode: "8000" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/process/geocode");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ address: "X 1, Zürich" });
  });

  it("distanceBetween posts from/to", async () => {
    const fetchMock = vi.fn(async () => json({ bikeMin: 10, transitMin: null }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await distanceBetween("A", "B")).toEqual({ bikeMin: 10, transitMin: null });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/process/distance");
  });

  it("checkListing returns gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ gone: true })));
    expect(await checkListing("https://x")).toBe(true);
  });

  it("parsePdf posts multipart and returns the extraction", async () => {
    const fetchMock = vi.fn(async () => json({ extracted: { name: "Flat" }, aiAvailable: true }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await parsePdf(new Uint8Array([1, 2]), "flat.pdf");
    expect(out).toEqual({ extracted: { name: "Flat" }, aiAvailable: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/process/parse-pdf");
    const form = init.body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("flat.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("parsePdf throws ParsePdfError carrying reason and retryAfterSeconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "AI quota exceeded — try again in 30s.", reason: "quota", retryAfterSeconds: 30 }, 429))
    );
    const err = await parsePdf(new Uint8Array([1]), "x.pdf").catch((e) => e);
    expect(err).toBeInstanceOf(ParsePdfError);
    expect(err.reason).toBe("quota");
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.status).toBe(429);
    expect(err.message).toBe("AI quota exceeded — try again in 30s.");
  });

  it("parsePdf maps a 413 to reason invalid_pdf", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "PDF too large to extract" }, 413)));
    const err = await parsePdf(new Uint8Array([1]), "x.pdf").catch((e) => e);
    expect(err.reason).toBe("invalid_pdf");
  });
});
