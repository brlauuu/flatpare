import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apartments: { id: "id", address: "address", userEditedFields: "uef" },
  apartmentDistances: { apartmentId: "apartment_id" },
  ratings: { apartmentId: "apartment_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/map-embed", () => ({
  buildMapEmbedUrl: vi.fn(() => "https://maps.example/embed"),
}));

const geocodeMock = vi.fn();
vi.mock("@/lib/geocode", () => ({
  geocodeLatLng: (...args: unknown[]) => geocodeMock(...args),
}));

import { GET, PATCH, DELETE } from "../route";
import { isAuthenticated } from "@/lib/auth";

const mockedAuth = vi.mocked(isAuthenticated);

beforeEach(() => {
  vi.clearAllMocks();
  geocodeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function selectReturns(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function selectUnlimited(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

describe("GET /api/apartments/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(false);
    const req = new Request("http://localhost/api/apartments/1");
    const res = await GET(req, withParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the apartment does not exist", async () => {
    mockedAuth.mockResolvedValue(true);
    selectReturns([]);
    const req = new Request("http://localhost/api/apartments/999");
    const res = await GET(req, withParams("999"));
    expect(res.status).toBe(404);
  });

  it("returns the apartment with ratings, distances, and mapEmbedUrl on success", async () => {
    mockedAuth.mockResolvedValue(true);
    selectReturns([{ id: 1, address: "Main St 1", userEditedFields: null }]);
    selectUnlimited([{ id: 11, kitchen: 4 }]);
    selectUnlimited([
      { locationId: 7, bikeMin: 8, transitMin: 12 },
    ]);

    const req = new Request("http://localhost/api/apartments/1");
    const res = await GET(req, withParams("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.ratings).toEqual([{ id: 11, kitchen: 4 }]);
    expect(body.distances).toEqual([
      { locationId: 7, bikeMin: 8, transitMin: 12 },
    ]);
    expect(body.mapEmbedUrl).toBe("https://maps.example/embed");
  });

  it("returns 500 on unexpected errors", async () => {
    mockedAuth.mockResolvedValue(true);
    mockSelect.mockImplementationOnce(() => {
      throw new Error("db dead");
    });
    const req = new Request("http://localhost/api/apartments/1");
    const res = await GET(req, withParams("1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db dead" });
  });
});

describe("PATCH /api/apartments/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(false);
    const req = new Request("http://localhost/api/apartments/1", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req, withParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the apartment does not exist", async () => {
    mockedAuth.mockResolvedValue(true);
    selectReturns([]);
    const req = new Request("http://localhost/api/apartments/999", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req, withParams("999"));
    expect(res.status).toBe(404);
  });

  it("updates and returns the apartment, merging userEditedFields", async () => {
    mockedAuth.mockResolvedValue(true);
    selectReturns([
      {
        id: 1,
        name: "Old",
        address: "Same",
        rentChf: 1000,
        userEditedFields: JSON.stringify(["name"]),
      },
    ]);
    let capturedSet: Record<string, unknown> | null = null;
    mockUpdate.mockReturnValueOnce({
      set: vi.fn((v: Record<string, unknown>) => {
        capturedSet = v;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                name: "New",
                address: "Same",
                rentChf: 1500,
                userEditedFields: JSON.stringify(["name", "rentChf"]),
              },
            ]),
          }),
        };
      }),
    });

    const req = new Request("http://localhost/api/apartments/1", {
      method: "PATCH",
      body: JSON.stringify({
        name: "New",
        address: "Same",
        rentChf: 1500,
      }),
    });
    const res = await PATCH(req, withParams("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New");
    // userEditedFields should be the union of previous + newly-changed
    // inferable fields. "name" was already edited; "rentChf" changed too.
    expect(capturedSet).not.toBeNull();
    const stored = JSON.parse(capturedSet!.userEditedFields as string);
    expect(stored).toEqual(expect.arrayContaining(["name", "rentChf"]));
  });

  it("re-geocodes when the address changes and returns the new lat/lng", async () => {
    mockedAuth.mockResolvedValue(true);
    selectReturns([
      {
        id: 1,
        address: "Old St",
        userEditedFields: null,
      },
    ]);
    // First update returns the row with the new address.
    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 1, address: "New St" },
          ]),
        }),
      }),
    });
    geocodeMock.mockResolvedValue({ lat: 47.5, lng: 8.5 });
    // Second update sets the geocoded coords.
    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 1, address: "New St", latitude: 47.5, longitude: 8.5 },
          ]),
        }),
      }),
    });

    const req = new Request("http://localhost/api/apartments/1", {
      method: "PATCH",
      body: JSON.stringify({ name: "x", address: "New St" }),
    });
    const res = await PATCH(req, withParams("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.latitude).toBe(47.5);
    expect(body.longitude).toBe(8.5);
    expect(geocodeMock).toHaveBeenCalledWith("New St");
  });

  it("does not fail the request when geocoding throws on address change", async () => {
    mockedAuth.mockResolvedValue(true);
    selectReturns([
      { id: 1, address: "Old St", userEditedFields: null },
    ]);
    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 1, address: "New St" },
          ]),
        }),
      }),
    });
    geocodeMock.mockRejectedValue(new Error("rate limit"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const req = new Request("http://localhost/api/apartments/1", {
      method: "PATCH",
      body: JSON.stringify({ address: "New St" }),
    });
    const res = await PATCH(req, withParams("1"));
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 500 when JSON body is malformed", async () => {
    mockedAuth.mockResolvedValue(true);
    const req = new Request("http://localhost/api/apartments/1", {
      method: "PATCH",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, withParams("1"));
    expect(res.status).toBe(500);
  });

  it("rejects an invalid availableFrom by storing null", async () => {
    mockedAuth.mockResolvedValue(true);
    selectReturns([
      { id: 1, address: "Same", userEditedFields: null },
    ]);
    let capturedSet: Record<string, unknown> | null = null;
    mockUpdate.mockReturnValueOnce({
      set: vi.fn((v: Record<string, unknown>) => {
        capturedSet = v;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          }),
        };
      }),
    });

    const req = new Request("http://localhost/api/apartments/1", {
      method: "PATCH",
      body: JSON.stringify({ availableFrom: "not-a-date" }),
    });
    const res = await PATCH(req, withParams("1"));
    expect(res.status).toBe(200);
    expect(capturedSet).not.toBeNull();
    expect(capturedSet!.availableFrom).toBeNull();
  });
});

describe("DELETE /api/apartments/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockedAuth.mockResolvedValue(false);
    const req = new Request("http://localhost/api/apartments/1", {
      method: "DELETE",
    });
    const res = await DELETE(req, withParams("1"));
    expect(res.status).toBe(401);
  });

  it("deletes and returns success", async () => {
    mockedAuth.mockResolvedValue(true);
    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const req = new Request("http://localhost/api/apartments/1", {
      method: "DELETE",
    });
    const res = await DELETE(req, withParams("1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("returns 500 on unexpected errors", async () => {
    mockedAuth.mockResolvedValue(true);
    mockDelete.mockImplementationOnce(() => {
      throw new Error("constraint failed");
    });
    const req = new Request("http://localhost/api/apartments/1", {
      method: "DELETE",
    });
    const res = await DELETE(req, withParams("1"));
    expect(res.status).toBe(500);
  });
});
