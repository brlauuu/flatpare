import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/geocode", () => ({
  extractPostcode: vi.fn(),
}));

import { extractPostcode } from "@/lib/geocode";
import {
  buildShortCode,
  computeShortCodeParts,
  generateShortCode,
  pickLetters,
} from "../short-code";

const mockedExtractPostcode = vi.mocked(extractPostcode);

beforeEach(() => {
  mockedExtractPostcode.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickLetters", () => {
  it("returns a 3-letter string from the allowed alphabet (no I/O/L)", () => {
    for (let i = 0; i < 50; i++) {
      const letters = pickLetters();
      expect(letters).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{3}$/);
    }
  });

  it("produces varied prefixes across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickLetters());
    // With 12,167 possibilities, 200 samples should have few collisions.
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe("computeShortCodeParts", () => {
  it("formats full data and calls extractPostcode once with the address", async () => {
    mockedExtractPostcode.mockResolvedValue("4057");
    const parts = await computeShortCodeParts({
      numRooms: 3.5,
      numBathrooms: 2,
      hasWashingMachine: true,
      address: "Steinenvorstadt 10, 4057 Basel",
    });
    expect(parts).toEqual({
      rooms: "3.5",
      baths: "2",
      wash: "Y",
      postcode: "4057",
    });
    expect(mockedExtractPostcode).toHaveBeenCalledWith(
      "Steinenvorstadt 10, 4057 Basel"
    );
  });

  it("renders ? for every missing field", async () => {
    const parts = await computeShortCodeParts({
      numRooms: null,
      numBathrooms: null,
      hasWashingMachine: null,
      address: null,
    });
    expect(parts).toEqual({ rooms: "?", baths: "?", wash: "?", postcode: "?" });
    expect(mockedExtractPostcode).not.toHaveBeenCalled();
  });

  it("renders WN for hasWashingMachine=false", async () => {
    mockedExtractPostcode.mockResolvedValue("10115");
    const parts = await computeShortCodeParts({
      numRooms: 2,
      numBathrooms: 1,
      hasWashingMachine: false,
      address: "Berlin 10115",
    });
    expect(parts.wash).toBe("N");
  });

  it("falls back to ? when address is present but geocode yields null", async () => {
    mockedExtractPostcode.mockResolvedValue(null);
    const parts = await computeShortCodeParts({
      numRooms: 3,
      numBathrooms: 1,
      hasWashingMachine: true,
      address: "Somewhere unknown",
    });
    expect(parts.postcode).toBe("?");
  });
});

describe("buildShortCode", () => {
  it("assembles all segments", () => {
    const code = buildShortCode(
      { rooms: "3.5", baths: "2", wash: "Y", postcode: "4057" },
      "JQI"
    );
    expect(code).toBe("JQI-3.5B-2b-WY-4057");
  });

  it("keeps the dot for half-rooms", () => {
    const code = buildShortCode(
      { rooms: "3.5", baths: "1", wash: "N", postcode: "4056" },
      "KPM"
    );
    expect(code).toContain("3.5B");
  });

  it("renders ? segments for missing data", () => {
    const code = buildShortCode(
      { rooms: "?", baths: "1", wash: "?", postcode: "?" },
      "JQI"
    );
    expect(code).toBe("JQI-?B-1b-W?-?");
  });

  it("handles UK-style postcode", () => {
    const code = buildShortCode(
      { rooms: "2", baths: "1", wash: "Y", postcode: "SW1A1AA" },
      "DZV"
    );
    expect(code).toBe("DZV-2B-1b-WY-SW1A1AA");
  });
});

describe("generateShortCode integration", () => {
  it("pulls letters from pickLetters when none provided", async () => {
    mockedExtractPostcode.mockResolvedValue("4057");
    const code = await generateShortCode({
      numRooms: 3,
      numBathrooms: 1,
      hasWashingMachine: true,
      address: "Basel 4057",
    });
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{3}-3B-1b-WY-4057$/);
  });

  it("accepts an explicit letters argument (useful for retry loops)", async () => {
    mockedExtractPostcode.mockResolvedValue("4057");
    const code = await generateShortCode(
      {
        numRooms: 3,
        numBathrooms: 1,
        hasWashingMachine: true,
        address: "Basel 4057",
      },
      "XYZ"
    );
    expect(code).toBe("XYZ-3B-1b-WY-4057");
  });
});
