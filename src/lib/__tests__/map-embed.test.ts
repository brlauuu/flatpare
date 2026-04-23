import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildMapEmbedUrl } from "../map-embed";

beforeEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
});

describe("buildMapEmbedUrl", () => {
  it("returns null when no API key is set", () => {
    expect(buildMapEmbedUrl("Steinenvorstadt 10, 4057 Basel")).toBeNull();
  });

  it("returns null when the address is null", () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    expect(buildMapEmbedUrl(null)).toBeNull();
  });

  it("returns null when the address is empty/whitespace", () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    expect(buildMapEmbedUrl("")).toBeNull();
    expect(buildMapEmbedUrl("   ")).toBeNull();
  });

  it("builds an Embed API URL with the key + encoded address", () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const url = buildMapEmbedUrl("Steinenvorstadt 10, 4057 Basel");
    expect(url).toContain("https://www.google.com/maps/embed/v1/place");
    expect(url).toContain("key=test-key");
    expect(url).toContain("q=Steinenvorstadt+10%2C+4057+Basel");
  });

  it("trims leading/trailing whitespace from the address", () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const url = buildMapEmbedUrl("  Sonnenweg 3  ");
    expect(url).toContain("q=Sonnenweg+3");
    expect(url).not.toContain("+++");
  });
});
