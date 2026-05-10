import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIsAuthenticated, dbMocks, checkListingsMock } = vi.hoisted(
  () => ({
    mockIsAuthenticated: vi.fn(async () => true),
    dbMocks: {
      select: vi.fn(),
      update: vi.fn(),
    },
    checkListingsMock: vi.fn(),
  })
);

vi.mock("@/lib/auth", () => ({
  isAuthenticated: mockIsAuthenticated,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => dbMocks.select(...args),
    update: (...args: unknown[]) => dbMocks.update(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apartments: {
    id: "id",
    listingUrl: "listing_url",
    listingGone: "listing_gone",
    listingCheckedAt: "listing_checked_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@/lib/listing-status", () => ({
  checkListings: checkListingsMock,
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.mockResolvedValue(true);
});

function selectReturns(rows: unknown[]) {
  dbMocks.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function updateReturnsOk() {
  dbMocks.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

describe("POST /api/apartments/check-listings", () => {
  it("checks each listing and updates rows whose `gone` status was determined", async () => {
    selectReturns([
      { id: 1, listingUrl: "https://example.com/a" },
      { id: 2, listingUrl: "https://example.com/b" },
      { id: 3, listingUrl: "  " }, // whitespace — filtered out
    ]);
    checkListingsMock.mockResolvedValue([
      { apartmentId: 1, gone: false, checkedAt: new Date() },
      { apartmentId: 2, gone: true, checkedAt: new Date() },
    ]);
    updateReturnsOk();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(2);
    expect(body.updated).toBe(2);
    expect(checkListingsMock).toHaveBeenCalledWith([
      { id: 1, listingUrl: "https://example.com/a" },
      { id: 2, listingUrl: "https://example.com/b" },
    ]);
    // Two updates fired (one per gone-or-not-gone result).
    expect(dbMocks.update).toHaveBeenCalledTimes(2);
  });

  it("skips updates when gone is null (indeterminate)", async () => {
    selectReturns([{ id: 1, listingUrl: "https://example.com/a" }]);
    checkListingsMock.mockResolvedValue([
      { apartmentId: 1, gone: null },
    ]);
    updateReturnsOk();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(1);
    expect(body.updated).toBe(0);
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("returns 500 when checkListings throws", async () => {
    selectReturns([{ id: 1, listingUrl: "https://example.com/a" }]);
    checkListingsMock.mockRejectedValue(new Error("network"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns an empty result when no apartments have listing URLs", async () => {
    selectReturns([]);
    checkListingsMock.mockResolvedValue([]);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      checked: 0,
      updated: 0,
      results: [],
    });
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
});
