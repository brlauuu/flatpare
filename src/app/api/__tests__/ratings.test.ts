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
    userName: "user_name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getDisplayName: vi.fn(),
}));

import { POST } from "../../api/apartments/[id]/ratings/route";
import { getDisplayName } from "@/lib/auth";

const mockedGetDisplayName = vi.mocked(getDisplayName);

beforeEach(() => {
  vi.clearAllMocks();
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

describe("POST /api/apartments/[id]/ratings", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetDisplayName.mockResolvedValue(null);

    const req = new Request("http://localhost/api/apartments/1/ratings", {
      method: "POST",
      body: JSON.stringify(ratingBody),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("inserts a new rating", async () => {
    mockedGetDisplayName.mockResolvedValue("Alice");

    // No existing rating
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const newRating = { id: 1, ...ratingBody, userName: "Alice" };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([newRating]),
      }),
    });

    const req = new Request("http://localhost/api/apartments/1/ratings", {
      method: "POST",
      body: JSON.stringify(ratingBody),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.userName).toBe("Alice");
  });

  it("updates an existing rating (upsert)", async () => {
    mockedGetDisplayName.mockResolvedValue("Alice");

    // Existing rating found
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 5, userName: "Alice" }]),
        }),
      }),
    });

    const updatedRating = { id: 5, ...ratingBody, userName: "Alice" };
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedRating]),
        }),
      }),
    });

    const req = new Request("http://localhost/api/apartments/1/ratings", {
      method: "POST",
      body: JSON.stringify(ratingBody),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(5);
  });
});
