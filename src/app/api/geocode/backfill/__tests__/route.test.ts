import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIsAuthenticated, selectMock, updateMock, geocodeMock } =
  vi.hoisted(() => ({
    mockIsAuthenticated: vi.fn(async () => true),
    selectMock: vi.fn(),
    updateMock: vi.fn(),
    geocodeMock: vi.fn(),
  }));

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
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apartments: {
    id: "id",
    address: "address",
    latitude: "latitude",
    longitude: "longitude",
  },
  locationsOfInterest: {
    id: "id",
    address: "address",
    latitude: "latitude",
    longitude: "longitude",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@/lib/geocode", () => ({
  geocodeLatLngWithReason: geocodeMock,
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.mockResolvedValue(true);
});

function selectReturns(rows: unknown[]) {
  selectMock.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function updateReturnsOk() {
  updateMock.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

describe("POST /api/geocode/backfill", () => {
  it("geocodes pending apartments + locations and writes the lat/lng", async () => {
    selectReturns([{ id: 1, address: "Apt St 1" }]);
    selectReturns([{ id: 11, address: "Loc St 1" }]);
    geocodeMock
      .mockResolvedValueOnce({ result: { lat: 47.5, lng: 8.5 } })
      .mockResolvedValueOnce({ result: { lat: 46.0, lng: 7.0 } });
    updateReturnsOk();

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pending).toBe(2);
    expect(body.updated).toBe(2);
    expect(body.failures).toEqual([]);
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it("collects failures with reasons when geocoding cannot resolve", async () => {
    selectReturns([{ id: 1, address: "Bogus Address" }]);
    selectReturns([]); // no pending locations
    geocodeMock.mockResolvedValueOnce({
      result: null,
      googleReason: "no_results",
      orsReason: "no_results",
    });
    updateReturnsOk();

    const res = await POST();
    const body = await res.json();
    expect(body.updated).toBe(0);
    expect(body.failures).toEqual([
      {
        table: "apartments",
        id: 1,
        address: "Bogus Address",
        googleReason: "no_results",
        orsReason: "no_results",
      },
    ]);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("filters out rows with empty/whitespace addresses before queuing", async () => {
    selectReturns([
      { id: 1, address: "" },
      { id: 2, address: "   " },
      { id: 3, address: "Real Address" },
    ]);
    selectReturns([]);
    geocodeMock.mockResolvedValueOnce({ result: { lat: 1, lng: 2 } });
    updateReturnsOk();

    const res = await POST();
    const body = await res.json();
    expect(body.pending).toBe(1);
    expect(body.updated).toBe(1);
    expect(geocodeMock).toHaveBeenCalledTimes(1);
  });

  it("logs and continues when a worker throws (does not halt the run)", async () => {
    selectReturns([
      { id: 1, address: "a" },
      { id: 2, address: "b" },
    ]);
    selectReturns([]);
    geocodeMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ result: { lat: 1, lng: 2 } });
    updateReturnsOk();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST();
    const body = await res.json();
    expect(body.pending).toBe(2);
    expect(body.updated).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 500 when the apartments query throws synchronously", async () => {
    selectMock.mockImplementationOnce(() => {
      throw new Error("db unreachable");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});
