import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apartments: {
    id: "id",
    name: "name",
    address: "address",
    sizeM2: "size_m2",
    numRooms: "num_rooms",
    numBathrooms: "num_bathrooms",
    numBalconies: "num_balconies",
    hasWashingMachine: "has_washing_machine",
    rentChf: "rent_chf",
    pdfUrl: "pdf_url",
    listingUrl: "listing_url",
    createdAt: "created_at",
  },
  ratings: {
    kitchen: "kitchen",
    balconies: "balconies",
    location: "location",
    floorplan: "floorplan",
    overallFeeling: "overall_feeling",
    apartmentId: "apartment_id",
  },
  apartmentDistances: {
    apartmentId: "apartment_id",
    locationId: "location_id",
  },
  locationsOfInterest: {
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn(),
  avg: vi.fn(),
  eq: vi.fn(),
  asc: vi.fn(),
  sql: vi.fn(),
}));

const mockListLocations = vi.fn().mockResolvedValue([]);
const mockCalculateDistance = vi.fn().mockResolvedValue({
  bikeMinutes: null,
  transitMinutes: null,
});
const mockGeocodeLatLng = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/locations", () => ({
  listLocations: () => mockListLocations(),
}));

vi.mock("@/lib/distance", () => ({
  calculateDistance: (...args: unknown[]) => mockCalculateDistance(...args),
}));

vi.mock("@/lib/geocode", () => ({
  geocodeLatLng: (...args: unknown[]) => mockGeocodeLatLng(...args),
}));

const mockGetDisplayName = vi.fn();
const mockIsAuthenticated = vi.fn();
vi.mock("@/lib/auth", () => ({
  getDisplayName: () => mockGetDisplayName(),
  isAuthenticated: () => mockIsAuthenticated(),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/short-code", () => ({
  computeShortCodeParts: vi.fn(async () => ({
    rooms: "?",
    baths: "?",
    wash: "?",
    postcode: "?",
  })),
  buildShortCode: vi.fn(() => "ABC-?B-?b-W?-?"),
  pickLetters: vi.fn(() => "ABC"),
}));

import { GET, POST } from "../../api/apartments/route";
import { GET as getById, PATCH, DELETE } from "../../api/apartments/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/apartments", () => {
  it("returns 401 when not authenticated", async () => {
    mockIsAuthenticated.mockResolvedValueOnce(false);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns list of apartments with myRating=null when no user cookie", async () => {
    const apartments = [
      { id: 1, name: "Apt 1", avgOverall: "4.5" },
      { id: 2, name: "Apt 2", avgOverall: null },
    ];
    mockGetDisplayName.mockResolvedValue(null);

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(apartments),
            }),
          }),
        }),
      })
      // apartmentDistances query
      .mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([]),
      });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([
      { id: 1, name: "Apt 1", avgOverall: "4.5", distances: [], myRating: null },
      { id: 2, name: "Apt 2", avgOverall: null, distances: [], myRating: null },
    ]);
  });

  it("populates myRating per apartment when the user has rated some of them", async () => {
    const apartments = [
      { id: 1, name: "Apt 1", avgOverall: "4.5" },
      { id: 2, name: "Apt 2", avgOverall: null },
      { id: 3, name: "Apt 3", avgOverall: "3.0" },
    ];
    mockGetDisplayName.mockResolvedValue("Alice");

    // First select call: apartments with avgs
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(apartments),
            }),
          }),
        }),
      })
      // Second select call: apartmentDistances
      .mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([]),
      })
      // Third select call: Alice's ratings — she rated apartments 1 and 3.
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { apartmentId: 1, overallFeeling: 4 },
            { apartmentId: 3, overallFeeling: 2 },
          ]),
        }),
      });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.map((a: { id: number; myRating: number | null }) => ({
      id: a.id,
      myRating: a.myRating,
    }))).toEqual([
      { id: 1, myRating: 4 },
      { id: 2, myRating: null },
      { id: 3, myRating: 2 },
    ]);
  });
});

describe("POST /api/apartments", () => {
  it("returns 401 when not authenticated", async () => {
    mockIsAuthenticated.mockResolvedValueOnce(false);
    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates a new apartment", async () => {
    const newApt = {
      name: "New Place",
      address: "Test St 1",
      sizeM2: 50,
      numRooms: 2,
      rentChf: 1500,
    };

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1, ...newApt }]),
      }),
    });

    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify(newApt),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("New Place");
  });

  it("geocodes and writes lat/lng on POST when an address is present", async () => {
    const newApt = {
      name: "Geocoded Apt",
      address: "Real St 1",
      sizeM2: 50,
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 7, ...newApt }]),
      }),
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockGeocodeLatLng.mockResolvedValueOnce({ lat: 47.5, lng: 8.5 });

    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify(newApt),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.latitude).toBe(47.5);
    expect(data.longitude).toBe(8.5);
    expect(mockGeocodeLatLng).toHaveBeenCalledWith("Real St 1");
  });

  it("does not fail when geocoding throws — apartment is still created", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 8, name: "x", address: "x" },
        ]),
      }),
    });
    mockGeocodeLatLng.mockRejectedValueOnce(new Error("rate limit"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({ name: "x", address: "x" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(errSpy).toHaveBeenCalled();
  });

  it("inserts a distance row per configured location when address is present", async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 9, name: "x", address: "a" }]),
      }),
    });
    // Subsequent inserts for apartmentDistances.
    const distanceInsert = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({
      values: distanceInsert,
    });
    mockGeocodeLatLng.mockResolvedValueOnce(null);
    mockListLocations.mockResolvedValueOnce([
      { id: 7, address: "Loc A" },
      { id: 8, address: "Loc B" },
    ]);
    mockCalculateDistance
      .mockResolvedValueOnce({ bikeMinutes: 12, transitMinutes: 25 })
      .mockResolvedValueOnce({ bikeMinutes: 18, transitMinutes: 30 });

    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({ name: "x", address: "a" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(distanceInsert).toHaveBeenCalledTimes(2);
  });

  it("logs and continues when distance calc throws for one location", async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 10, name: "x", address: "a" }]),
      }),
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockGeocodeLatLng.mockResolvedValueOnce(null);
    mockListLocations.mockResolvedValueOnce([
      { id: 7, address: "Loc A" },
      { id: 8, address: "Loc B" },
    ]);
    mockCalculateDistance
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce({ bikeMinutes: 18, transitMinutes: 30 });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({ name: "x", address: "a" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(errSpy).toHaveBeenCalled();
  });

  it("retries on unique-constraint collisions and eventually succeeds", async () => {
    const newApt = { name: "Retry Apt", address: null };
    let attempts = 0;
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error("UNIQUE constraint failed: apartments.short_code");
          }
          return [{ id: 7, ...newApt }];
        }),
      }),
    });

    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify(newApt),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it("returns 500 when the short-code retry budget is exhausted", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(
          new Error("UNIQUE constraint failed: apartments.short_code")
        ),
      }),
    });
    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({ name: "x", address: null }),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });

  it("ignores invalid availableFrom (stores null)", async () => {
    let captured: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn((v: Record<string, unknown>) => {
        captured = v;
        return {
          returning: vi.fn().mockResolvedValue([{ id: 1, ...v }]),
        };
      }),
    });
    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({
        name: "x",
        address: null,
        availableFrom: "not-a-date",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(captured).not.toBeNull();
    expect(captured!.availableFrom).toBeNull();
  });

  it("preserves a valid ISO availableFrom", async () => {
    let captured: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn((v: Record<string, unknown>) => {
        captured = v;
        return {
          returning: vi.fn().mockResolvedValue([{ id: 1, ...v }]),
        };
      }),
    });
    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({
        name: "x",
        address: null,
        availableFrom: "2026-07-01",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(captured).not.toBeNull();
    expect(captured!.availableFrom).toBe(
      "2026-07-01"
    );
  });

  it("serializes rawExtractedData as JSON when provided", async () => {
    let captured: Record<string, unknown> | null = null;
    mockInsert.mockReturnValue({
      values: vi.fn((v: Record<string, unknown>) => {
        captured = v;
        return {
          returning: vi.fn().mockResolvedValue([{ id: 1, ...v }]),
        };
      }),
    });
    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({
        name: "x",
        address: null,
        rawExtractedData: { foo: "bar", n: 42 },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(captured).not.toBeNull();
    const stored = captured!.rawExtractedData as string;
    expect(JSON.parse(stored)).toEqual({ foo: "bar", n: 42 });
  });

  it("returns 500 on a non-constraint database error", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("disk full")),
      }),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: JSON.stringify({ name: "x", address: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/disk full/);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 500 on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/apartments", {
      method: "POST",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("GET /api/apartments/[id]", () => {
  it("returns apartment with ratings", async () => {
    // First select: apartment
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, name: "Apt 1" }]),
          }),
        }),
      })
      // Second select: ratings
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 1, userName: "Alice", kitchen: 4 },
          ]),
        }),
      })
      // Third select: apartment_distances
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    const req = new Request("http://localhost/api/apartments/1");
    const res = await getById(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Apt 1");
    expect(data.ratings).toHaveLength(1);
    expect(data.distances).toEqual([]);
  });

  it("returns 404 for non-existent apartment", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = new Request("http://localhost/api/apartments/999");
    const res = await getById(req, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/apartments/[id]", () => {
  it("updates an apartment", async () => {
    const current = { id: 1, name: "Old Name", userEditedFields: null };
    const updated = { id: 1, name: "Updated" };

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([current]),
        }),
      }),
    });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });

    const req = new Request("http://localhost/api/apartments/1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated");
  });

  it("returns 404 when apartment not found", async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = new Request("http://localhost/api/apartments/999", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nope" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/apartments/[id]", () => {
  it("deletes an apartment", async () => {
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const req = new Request("http://localhost/api/apartments/1", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
