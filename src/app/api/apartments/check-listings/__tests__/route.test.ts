import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireHousehold, mockAssertMembership, dbMocks, checkListingsMock } =
  vi.hoisted(() => ({
    mockRequireHousehold: vi.fn(),
    mockAssertMembership: vi.fn(),
    dbMocks: {
      select: vi.fn(),
      update: vi.fn(),
    },
    checkListingsMock: vi.fn(),
  })
);

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

vi.mock("@/lib/household", async () => {
  const actual = await vi.importActual<typeof import("@/lib/household")>(
    "@/lib/household"
  );
  return { ...actual, assertMembership: mockAssertMembership };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => dbMocks.select(...args),
    update: (...args: unknown[]) => dbMocks.update(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apartments: {
    id: "id",
    householdId: "household_id",
    listingUrl: "listing_url",
    listingGone: "listing_gone",
    listingCheckedAt: "listing_checked_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@/lib/listing-status", () => ({
  checkListings: checkListingsMock,
}));

import { ForbiddenError, UnauthorizedError } from "@/lib/household";
import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireHousehold.mockResolvedValue({
    householdId: 7,
    userId: "u1",
    role: "owner",
  });
  mockAssertMembership.mockResolvedValue("owner");
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

  it("returns 401 without a session and never queries", async () => {
    mockRequireHousehold.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST();
    expect(res.status).toBe(401);
    expect(dbMocks.select).not.toHaveBeenCalled();
    expect(checkListingsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the database says the member was removed", async () => {
    mockAssertMembership.mockRejectedValueOnce(new ForbiddenError());
    const res = await POST();
    // 404, not 403.
    expect(res.status).toBe(404);
    expect(dbMocks.select).not.toHaveBeenCalled();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
});
