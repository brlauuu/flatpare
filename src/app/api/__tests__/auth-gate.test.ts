// Defense-in-depth check: every data route resolves the session household for
// itself and answers 401 when there is none, even if the proxy is
// misconfigured. (This guard was an isAuthenticated() call until Task 5
// replaced it with requireHousehold(), which is both the authentication check
// and the tenant scope.)
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireHousehold } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

// Stub every collaborator the imported routes pull in, so importing the
// modules doesn't try to hit a database or external API. The 401 gate
// short-circuits before any of these are called.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({
  apartments: {},
  apartmentDistances: {},
  locationsOfInterest: {},
  ratings: {},
  households: {},
  householdMembers: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  avg: vi.fn(),
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
vi.mock("@/lib/map-embed", () => ({ buildMapEmbedUrl: vi.fn() }));
vi.mock("@/lib/short-code", () => ({
  computeShortCodeParts: vi.fn(),
  buildShortCode: vi.fn(),
  pickLetters: vi.fn(),
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
import {
  GET as apartmentsGET,
  POST as apartmentsPOST,
} from "../apartments/route";
import {
  GET as apartmentGET,
  PATCH as apartmentPATCH,
  DELETE as apartmentDELETE,
} from "../apartments/[id]/route";
import { POST as ratingPOST } from "../apartments/[id]/ratings/route";
import { UnauthorizedError } from "@/lib/household";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireHousehold.mockRejectedValue(new UnauthorizedError());
});

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Defense-in-depth: routes return 401 when there is no session", () => {
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

  it("GET /api/apartments", async () => {
    expect((await apartmentsGET()).status).toBe(401);
  });

  it("POST /api/apartments", async () => {
    const req = new Request("http://x/api/apartments", {
      method: "POST",
      body: JSON.stringify({ name: "x" }),
    });
    expect((await apartmentsPOST(req)).status).toBe(401);
  });

  it("GET /api/apartments/[id]", async () => {
    const res = await apartmentGET(
      new Request("http://x/api/apartments/1"),
      withParams("1")
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /api/apartments/[id]", async () => {
    const res = await apartmentPATCH(
      new Request("http://x/api/apartments/1", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      withParams("1")
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /api/apartments/[id]", async () => {
    const res = await apartmentDELETE(
      new Request("http://x/api/apartments/1", { method: "DELETE" }),
      withParams("1")
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/apartments/[id]/ratings", async () => {
    const res = await ratingPOST(
      new Request("http://x/api/apartments/1/ratings", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      withParams("1")
    );
    expect(res.status).toBe(401);
  });
});
