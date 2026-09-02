// @vitest-environment node
//
// Regression test for C1: a member of household 1 could POST
// { pathname: "households/2/secret.pdf" } to the JSON branch of
// /api/parse-pdf and get household 2's extracted PDF content back, because
// readStoredFile never checked whose household the client-supplied
// pathname belonged to. Deliberately uses the real storage.ts (not a
// mock) so this test would fail again if the household check in
// readStoredFile were ever removed or bypassed at this call site.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireHousehold } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(async () => ({
    householdId: 1,
    userId: "u1",
    role: "owner" as const,
  })),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(async () => true),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

// Household 2's blob genuinely contains sensitive data — the whole point
// of this test is to confirm household 1 never gets it back.
const HOUSEHOLD_2_SECRET = "SECRET-HOUSEHOLD-2-LISTING-DATA";

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (pathname: string) => ({
    statusCode: 200,
    stream: new Response(
      new TextEncoder().encode(
        pathname.includes("households/2/")
          ? HOUSEHOLD_2_SECRET
          : "own-household-bytes"
      )
    ).body,
  })),
}));

const { mockExtractApartmentData } = vi.hoisted(() => ({
  mockExtractApartmentData: vi.fn(async () => ({
    name: "Extracted Apt",
    address: "Test St 1",
    sizeM2: 65,
    numRooms: 3,
    numBathrooms: 1,
    numBalconies: 1,
    hasWashingMachine: true,
    rentChf: 1800,
  })),
}));

vi.mock("@/lib/parse-pdf", () => ({
  extractApartmentData: mockExtractApartmentData,
}));

import { POST } from "../parse-pdf/route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
  mockRequireHousehold.mockResolvedValue({
    householdId: 1,
    userId: "u1",
    role: "owner" as const,
  });
});

afterEach(() => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  vi.restoreAllMocks();
});

describe("POST /api/parse-pdf — cross-household JSON branch (C1 regression)", () => {
  it("does not read or extract another household's blob when the caller is in household 1", async () => {
    const req = new Request("http://localhost/api/parse-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathname: "households/2/secret.pdf",
        filename: "secret.pdf",
      }),
    });

    const res = await POST(req);
    const body = await res.text();

    // Never returns 200 with household 2's data.
    expect(body).not.toContain(HOUSEHOLD_2_SECRET);
    expect(res.status).not.toBe(200);
    // extractApartmentData is only reachable after a successful read —
    // confirming it was never called proves the leak never got that far.
    expect(mockExtractApartmentData).not.toHaveBeenCalled();
  });

  it("still serves the caller's own household's blob on the JSON branch", async () => {
    const req = new Request("http://localhost/api/parse-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathname: "households/1/listing.pdf",
        filename: "listing.pdf",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aiAvailable).toBe(true);
    expect(data.extracted.name).toBe("Extracted Apt");
  });
});
