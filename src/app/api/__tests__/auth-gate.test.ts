// Defense-in-depth check: every route handler that gained an in-route
// isAuthenticated() guard in #153 should return 401 when the auth helper
// reports unauthenticated, even if the proxy is misconfigured. This file
// exercises the routes that don't have a dedicated test file of their own.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIsAuthenticated } = vi.hoisted(() => ({
  mockIsAuthenticated: vi.fn(async () => false),
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticated: mockIsAuthenticated,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

// Stub every collaborator the imported routes pull in, so importing the
// modules doesn't try to hit a database or external API. The 401 gate
// short-circuits before any of these are called.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({
  apartments: {},
  apartmentDistances: {},
  apiUsage: {},
  locationsOfInterest: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  sql: vi.fn(),
  sum: vi.fn(),
  count: vi.fn(),
  gte: vi.fn(),
}));
vi.mock("@/lib/listing-status", () => ({ checkListings: vi.fn() }));
vi.mock("@/lib/parse-pdf", () => ({ extractApartmentData: vi.fn() }));
vi.mock("@/lib/parse-pdf-error", () => ({ classifyParsePdfError: vi.fn() }));
vi.mock("@/lib/edited-fields", () => ({ INFERABLE_FIELDS: [] }));
vi.mock("@/lib/storage", () => ({ readStoredFile: vi.fn() }));
vi.mock("@/lib/locations", () => ({
  listLocations: vi.fn(),
  createLocation: vi.fn(),
  getLocation: vi.fn(),
  updateLocation: vi.fn(),
  deleteLocation: vi.fn(),
  moveLocation: vi.fn(),
}));
vi.mock("@/lib/distance", () => ({ calculateDistance: vi.fn() }));
vi.mock("@/lib/geocode", () => ({
  geocodeLatLng: vi.fn(),
  geocodeLatLngWithReason: vi.fn(),
}));

import { POST as checkListingsPOST } from "../apartments/check-listings/route";
import { POST as reprocessPOST } from "../apartments/[id]/reprocess/route";
import { POST as backfillPOST } from "../geocode/backfill/route";
import { POST as recomputePOST } from "../settings/recompute-distances/route";
import {
  GET as locationsGET,
  POST as locationsPOST,
} from "../locations/route";
import {
  GET as locationGET,
  PUT as locationPUT,
  DELETE as locationDELETE,
} from "../locations/[id]/route";
import { POST as movePOST } from "../locations/[id]/move/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.mockResolvedValue(false);
});

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Defense-in-depth: routes return 401 when isAuthenticated() is false", () => {
  it("POST /api/apartments/check-listings", async () => {
    const res = await checkListingsPOST();
    expect(res.status).toBe(401);
  });

  it("POST /api/apartments/[id]/reprocess", async () => {
    const req = new Request("http://x/api/apartments/1/reprocess", {
      method: "POST",
    });
    const res = await reprocessPOST(req, withParams("1"));
    expect(res.status).toBe(401);
  });

  it("POST /api/geocode/backfill", async () => {
    const res = await backfillPOST();
    expect(res.status).toBe(401);
  });

  it("POST /api/settings/recompute-distances", async () => {
    const res = await recomputePOST();
    expect(res.status).toBe(401);
  });

  it("GET /api/locations", async () => {
    const res = await locationsGET();
    expect(res.status).toBe(401);
  });

  it("POST /api/locations", async () => {
    const req = new Request("http://x/api/locations", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await locationsPOST(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/locations/[id]", async () => {
    const req = new Request("http://x/api/locations/1");
    const res = await locationGET(req, withParams("1"));
    expect(res.status).toBe(401);
  });

  it("PUT /api/locations/[id]", async () => {
    const req = new Request("http://x/api/locations/1", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await locationPUT(req, withParams("1"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/locations/[id]", async () => {
    const req = new Request("http://x/api/locations/1", { method: "DELETE" });
    const res = await locationDELETE(req, withParams("1"));
    expect(res.status).toBe(401);
  });

  it("POST /api/locations/[id]/move", async () => {
    const req = new Request("http://x/api/locations/1/move", {
      method: "POST",
      body: JSON.stringify({ direction: "up" }),
    });
    const res = await movePOST(req, withParams("1"));
    expect(res.status).toBe(401);
  });
});
