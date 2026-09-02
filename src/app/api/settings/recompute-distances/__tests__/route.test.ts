import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireHousehold,
  selectMock,
  insertMock,
  listLocationsMock,
  calcDistanceMock,
} = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  listLocationsMock: vi.fn(),
  calcDistanceMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apartments: { id: "id", address: "address", householdId: "household_id" },
  apartmentDistances: {
    apartmentId: "apartment_id",
    locationId: "location_id",
    householdId: "household_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/distance", () => ({
  calculateDistance: calcDistanceMock,
}));

vi.mock("@/lib/locations", () => ({
  listLocations: listLocationsMock,
}));

import { UnauthorizedError } from "@/lib/household";
import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireHousehold.mockResolvedValue({
    householdId: 7,
    userId: "u1",
    role: "owner",
  });
});

function selectApartments(rows: unknown[]) {
  selectMock.mockReturnValueOnce({
    // .from(...).where(...) — the where is the household predicate.
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function insertReturnsOk() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  insertMock.mockReturnValue({
    values: vi.fn().mockReturnValue({ onConflictDoUpdate }),
  });
  return onConflictDoUpdate;
}

const sampleLocations = [
  { id: 7, label: "Train", icon: "Train", address: "Basel SBB" },
];

describe("POST /api/settings/recompute-distances", () => {
  it("upserts a distance row per (apartment, location) pair on success", async () => {
    selectApartments([{ id: 1, address: "Apt St 1" }]);
    listLocationsMock.mockResolvedValue(sampleLocations);
    calcDistanceMock.mockResolvedValue({ bikeMinutes: 12, transitMinutes: 25 });
    const onConflict = insertReturnsOk();

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalApartments: 1,
      totalLocations: 1,
      updated: 1,
      failed: 0,
      skipped: 0,
    });
    expect(calcDistanceMock).toHaveBeenCalledWith("Basel SBB", "Apt St 1");
    expect(onConflict).toHaveBeenCalledTimes(1);
  });

  it("counts apartments without an address as skipped (location count × them)", async () => {
    selectApartments([
      { id: 1, address: null },
      { id: 2, address: "ok" },
    ]);
    listLocationsMock.mockResolvedValue(sampleLocations);
    calcDistanceMock.mockResolvedValue({ bikeMinutes: 9, transitMinutes: 18 });
    insertReturnsOk();

    const res = await POST();
    const body = await res.json();
    expect(body.skipped).toBe(1); // one apartment without address × 1 location
    expect(body.updated).toBe(1);
    expect(body.failed).toBe(0);
  });

  it("counts (null, null) distance results as failed without writing", async () => {
    selectApartments([{ id: 1, address: "x" }]);
    listLocationsMock.mockResolvedValue(sampleLocations);
    calcDistanceMock.mockResolvedValue({
      bikeMinutes: null,
      transitMinutes: null,
    });
    const onConflict = insertReturnsOk();

    const res = await POST();
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.updated).toBe(0);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("counts thrown errors per pair as failed and continues", async () => {
    selectApartments([
      { id: 1, address: "a" },
      { id: 2, address: "b" },
    ]);
    listLocationsMock.mockResolvedValue(sampleLocations);
    calcDistanceMock
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce({ bikeMinutes: 5, transitMinutes: 10 });
    insertReturnsOk();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST();
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.updated).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 500 when the apartments query throws", async () => {
    selectMock.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });

  it("asks the locations lib for THIS household's locations only", async () => {
    selectApartments([{ id: 1, address: "Apt St 1" }]);
    listLocationsMock.mockResolvedValue(sampleLocations);
    calcDistanceMock.mockResolvedValue({ bikeMinutes: 1, transitMinutes: 2 });
    insertReturnsOk();

    await POST();
    expect(listLocationsMock).toHaveBeenCalledWith(7);
  });

  it("returns 401 without a session and never queries", async () => {
    mockRequireHousehold.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST();
    expect(res.status).toBe(401);
    expect(selectMock).not.toHaveBeenCalled();
    expect(listLocationsMock).not.toHaveBeenCalled();
  });
});
