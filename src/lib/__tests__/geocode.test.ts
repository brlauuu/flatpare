import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(async () => {}) })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apiUsage: {},
}));

import { extractPostcode } from "../geocode";

beforeEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.OPENROUTESERVICE_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractPostcode — regex branch", () => {
  it("pulls a 4-digit Swiss postcode", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    expect(
      await extractPostcode("Steinenvorstadt 10, 4057 Basel")
    ).toBe("4057");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pulls a 5-digit German postcode", async () => {
    expect(await extractPostcode("Unter den Linden 1, 10115 Berlin")).toBe(
      "10115"
    );
  });

  it("pulls a 5-digit US postcode", async () => {
    expect(
      await extractPostcode("1 Market St, San Francisco, CA 94107")
    ).toBe("94107");
  });

  it("pulls a UK postcode with a space", async () => {
    expect(await extractPostcode("10 Downing St, London SW1A 1AA")).toBe(
      "SW1A1AA"
    );
  });

  it("pulls a UK postcode with no space", async () => {
    expect(await extractPostcode("Foo Rd, London SW1A1AA")).toBe("SW1A1AA");
  });

  it("returns null for an empty or non-postcode address", async () => {
    expect(await extractPostcode("")).toBeNull();
    expect(await extractPostcode("   ")).toBeNull();
  });
});

describe("extractPostcode — Google fallback", () => {
  it("calls Google Geocoding when regex fails and the key is set", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                address_components: [
                  {
                    long_name: "8001",
                    types: ["postal_code"],
                  },
                ],
              },
            ],
          }),
      } as Response);

    const result = await extractPostcode("Some place without a numeric code");

    expect(fetchSpy).toHaveBeenCalled();
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("maps.googleapis.com/maps/api/geocode/json");
    expect(result).toBe("8001");
  });

  it("returns null when Google returns no postal_code component", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    } as Response);

    expect(
      await extractPostcode("Some place without a numeric code")
    ).toBeNull();
  });
});

describe("extractPostcode — ORS fallback", () => {
  it("uses OpenRouteService when Google is absent", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "k";
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [{ properties: { postalcode: "  4057 " } }],
        }),
    } as Response);

    const result = await extractPostcode("Plain address");

    expect(fetchSpy).toHaveBeenCalled();
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("api.openrouteservice.org/geocode/search");
    expect(result).toBe("4057");
  });
});

describe("extractPostcode — no providers available", () => {
  it("returns null when regex fails and neither key is set", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    expect(await extractPostcode("A street with no digits")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
