import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  ratings: {
    id: "id",
    apartmentId: "apartment_id",
    userId: "user_id",
    householdId: "household_id",
  },
  apartments: {
    id: "id",
    householdId: "household_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

const { mockRequireHousehold, mockAssertMembership } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(),
  mockAssertMembership: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

vi.mock("@/lib/household", async () => {
  const actual = await vi.importActual<typeof import("@/lib/household")>(
    "@/lib/household"
  );
  return { ...actual, assertMembership: mockAssertMembership };
});

import { ForbiddenError, UnauthorizedError } from "@/lib/household";
import { POST } from "../../api/apartments/[id]/ratings/route";

const HOUSEHOLD_ID = 7;
const USER_ID = "u1";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireHousehold.mockResolvedValue({
    householdId: HOUSEHOLD_ID,
    userId: USER_ID,
    role: "owner",
  });
  mockAssertMembership.mockResolvedValue("owner");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ratingBody = {
  kitchen: 4,
  balconies: 3,
  location: 5,
  floorplan: 4,
  overallFeeling: 4,
  comment: "Nice place",
};

function request() {
  return new Request("http://localhost/api/apartments/1/ratings", {
    method: "POST",
    body: JSON.stringify(ratingBody),
  });
}

const params = () => ({ params: Promise.resolve({ id: "1" }) });

// First select: does the apartment belong to the caller's household?
function ownershipCheck(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

// Second select: the caller's existing rating for that apartment, if any.
function existingRating(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

describe("POST /api/apartments/[id]/ratings", () => {
  it("returns 401 when there is no session", async () => {
    mockRequireHousehold.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(request(), params());
    expect(res.status).toBe(401);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns 404 when the database says the member was removed", async () => {
    mockAssertMembership.mockRejectedValueOnce(new ForbiddenError());
    const res = await POST(request(), params());
    // 404, not 403.
    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 404 when the apartment is not in the caller's household", async () => {
    ownershipCheck([]);
    const res = await POST(request(), params());
    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("inserts a new rating keyed to the session user and household", async () => {
    ownershipCheck([{ id: 1 }]);
    existingRating([]);

    let captured: Record<string, unknown> | null = null;
    const newRating = {
      id: 1,
      ...ratingBody,
      userId: USER_ID,
      householdId: HOUSEHOLD_ID,
    };
    mockInsert.mockReturnValue({
      values: vi.fn((v: Record<string, unknown>) => {
        captured = v;
        return { returning: vi.fn().mockResolvedValue([newRating]) };
      }),
    });

    const res = await POST(request(), params());
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.userId).toBe(USER_ID);
    expect(captured).toMatchObject({
      userId: USER_ID,
      householdId: HOUSEHOLD_ID,
      apartmentId: 1,
    });
  });

  it("updates an existing rating (upsert)", async () => {
    ownershipCheck([{ id: 1 }]);
    existingRating([{ id: 5, userId: USER_ID }]);

    const updatedRating = {
      id: 5,
      ...ratingBody,
      userId: USER_ID,
      householdId: HOUSEHOLD_ID,
    };
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedRating]),
        }),
      }),
    });

    const res = await POST(request(), params());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(5);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    ownershipCheck([{ id: 1 }]);
    mockSelect.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request(), params());
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});
