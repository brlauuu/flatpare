import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the db module
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apiUsage: {},
}));

vi.mock("@/lib/app-settings", () => ({
  getStationAddress: vi.fn().mockResolvedValue("Basel SBB, Switzerland"),
}));

import { calculateDistance } from "../distance";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.OPENROUTESERVICE_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("calculateDistance", () => {
  it("returns nulls when no provider is configured", async () => {
    const result = await calculateDistance("Basel, Switzerland");
    expect(result).toEqual({ bikeMinutes: null, transitMinutes: null });
  });

  it("uses Google Maps when GOOGLE_MAPS_API_KEY is set", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        rows: [
          {
            elements: [
              { status: "OK", duration: { value: 600 } }, // 10 min
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await calculateDistance("Zürich, Switzerland");
    expect(result.bikeMinutes).toBe(10);
    expect(result.transitMinutes).toBe(10);
    expect(mockFetch).toHaveBeenCalledTimes(2); // bike + transit
  });

  it("returns nulls when Google Maps API returns non-OK status", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          rows: [{ elements: [{ status: "NOT_FOUND" }] }],
        }),
      })
    );

    const result = await calculateDistance("Nonexistent Place");
    expect(result).toEqual({ bikeMinutes: null, transitMinutes: null });
  });

  it("falls back to OpenRouteService when no Google key", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "ors-key";

    const mockFetch = vi
      .fn()
      // geocode station call
      .mockResolvedValueOnce({
        json: async () => ({
          features: [{ geometry: { coordinates: [7.5897, 47.5476] } }],
        }),
      })
      // geocode address call
      .mockResolvedValueOnce({
        json: async () => ({
          features: [{ geometry: { coordinates: [7.58, 47.55] } }],
        }),
      })
      // route call
      .mockResolvedValueOnce({
        json: async () => ({
          routes: [{ summary: { duration: 900 } }], // 15 min
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const result = await calculateDistance("Zürich, Switzerland");
    expect(result.bikeMinutes).toBe(15);
    expect(result.transitMinutes).toBeNull(); // ORS doesn't support transit
  });

  it("returns nulls when ORS geocoding fails", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "ors-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ features: [] }),
      })
    );

    const result = await calculateDistance("???");
    expect(result).toEqual({ bikeMinutes: null, transitMinutes: null });
  });

  it("returns nulls when Google Maps fetch throws", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    const result = await calculateDistance("Somewhere");
    expect(result).toEqual({ bikeMinutes: null, transitMinutes: null });
  });
});
