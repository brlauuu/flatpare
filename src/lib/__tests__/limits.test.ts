import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readLimits, VERCEL_PDF_READ_MAX_BYTES } from "../limits";

const ORIGINAL = {
  members: process.env.MAX_MEMBERS,
  apartments: process.env.MAX_APARTMENTS,
};

beforeEach(() => {
  delete process.env.MAX_MEMBERS;
  delete process.env.MAX_APARTMENTS;
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("PARSE_PDF_MAX_BYTES", "");
});

afterEach(() => {
  for (const [key, value] of [
    ["MAX_MEMBERS", ORIGINAL.members],
    ["MAX_APARTMENTS", ORIGINAL.apartments],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllEnvs();
});

describe("readLimits", () => {
  // The self-hoster default, called out explicitly in #187 as a regression
  // that must not happen.
  it("is unlimited on both axes when neither var is set", () => {
    expect(readLimits()).toMatchObject({ maxMembers: null, maxApartments: null });
  });

  it("reads each var independently", () => {
    process.env.MAX_APARTMENTS = "20";
    expect(readLimits()).toMatchObject({ maxMembers: null, maxApartments: 20 });
    process.env.MAX_MEMBERS = "5";
    expect(readLimits()).toMatchObject({ maxMembers: 5, maxApartments: 20 });
  });

  // #438: Vercel refuses a body over 4.5 MB; a self-hosted server does not.
  it("reads PDFs up to the route's own limit off Vercel", () => {
    expect(readLimits().pdfReadMaxBytes).toBe(20 * 1024 * 1024);
    vi.stubEnv("PARSE_PDF_MAX_BYTES", "1000");
    expect(readLimits().pdfReadMaxBytes).toBe(1000);
  });

  it("stays under Vercel's 4.5 MB body limit on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(readLimits().pdfReadMaxBytes).toBe(VERCEL_PDF_READ_MAX_BYTES);
    expect(VERCEL_PDF_READ_MAX_BYTES).toBeLessThan(4_500_000);
    vi.stubEnv("PARSE_PDF_MAX_BYTES", "1000");
    expect(readLimits().pdfReadMaxBytes).toBe(1000);
  });

  it("does not consult households.tier — there is no free tier to distinguish", () => {
    // Guard against a future reintroduction of tier-based limits without a
    // deliberate decision: readLimits takes no arguments at all, so it cannot
    // vary by household.
    expect(readLimits.length).toBe(0);
  });
});
