/**
 * Cross-household isolation, proven against the REAL test SQLite database.
 *
 * `db` is deliberately NOT mocked here. A mocked `select()` returns its
 * fixture regardless of the `where` clause, so a mock-based isolation test
 * passes even when scoping is entirely absent — it would prove nothing. The
 * pre-existing handler suites keep mocking `db`; their job is handler logic,
 * and this file is the one that proves the tenancy boundary.
 *
 * Only the third-party edges are mocked (geocoding, distance, listing checks,
 * PDF extraction, blob storage): they are network calls, and none of them is
 * what the boundary depends on.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  apartments,
  apartmentDistances,
  households,
  householdMembers,
  locationsOfInterest,
  ratings,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

const currentSession = {
  householdId: 0,
  userId: "",
  role: "owner" as const,
};

// requireHousehold lives in @/lib/session (ruling R1 split it out of
// household.ts to break a module cycle). @/lib/household is left REAL on
// purpose: assertMembership's database re-check is part of what is under test.
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

const geocodeLatLng = vi.fn(async () => null as { lat: number; lng: number } | null);
const geocodeLatLngWithReason = vi.fn(async () => ({
  result: { lat: 1, lng: 2 } as { lat: number; lng: number } | null,
  googleReason: undefined as string | undefined,
  orsReason: undefined as string | undefined,
}));
vi.mock("@/lib/geocode", () => ({
  geocodeLatLng: (...args: unknown[]) => geocodeLatLng(...(args as [])),
  geocodeLatLngWithReason: (...args: unknown[]) =>
    geocodeLatLngWithReason(...(args as [])),
}));

const calculateDistance = vi.fn(async () => ({
  bikeMinutes: 5 as number | null,
  transitMinutes: 7 as number | null,
}));
vi.mock("@/lib/distance", () => ({
  calculateDistance: (...args: unknown[]) => calculateDistance(...(args as [])),
}));

const checkListings = vi.fn(
  async (rows: { id: number; listingUrl: string }[]) =>
    rows.map((r) => ({ apartmentId: r.id, gone: true, status: 404 }))
);
vi.mock("@/lib/listing-status", () => ({
  checkListings: (rows: { id: number; listingUrl: string }[]) =>
    checkListings(rows),
}));

const extractApartmentData = vi.fn(async () => ({
  name: "REPROCESSED",
  address: "Reprocessed 1",
  sizeM2: 99,
  numRooms: 9,
  numBathrooms: 9,
  numBalconies: 9,
  hasWashingMachine: true,
  rentChf: 9999,
  listingUrl: null,
  summary: "reprocessed",
  availableFrom: null,
}));
vi.mock("@/lib/parse-pdf", () => ({
  extractApartmentData: () => extractApartmentData(),
}));

const readStoredFile = vi.fn(async () => Buffer.from("%PDF-1.4"));
// Only the two I/O functions are stubbed; householdIdFromStoredPath is the
// REAL parser, because the pdfUrl write-time check under test is exactly that
// parser applied to a caller-supplied string.
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>(
    "@/lib/storage"
  );
  return {
    ...actual,
    readStoredFile: (...args: unknown[]) => readStoredFile(...(args as [])),
    uploadFile: vi.fn(async () => "/api/uploads/households/1/x.pdf"),
  };
});

import { GET as apartmentsGet, POST as apartmentsPost } from "../apartments/route";
import {
  GET as apartmentGet,
  PATCH as apartmentPatch,
  DELETE as apartmentDelete,
} from "../apartments/[id]/route";
import { POST as ratingPost } from "../apartments/[id]/ratings/route";
import { POST as reprocessPost } from "../apartments/[id]/reprocess/route";
import { POST as checkListingsPost } from "../apartments/check-listings/route";
import { GET as locationsGet, POST as locationsPost } from "../locations/route";
import {
  GET as locationGet,
  PUT as locationPut,
  DELETE as locationDelete,
} from "../locations/[id]/route";
import { POST as locationMovePost } from "../locations/[id]/move/route";
import { POST as backfillPost } from "../geocode/backfill/route";
import { POST as recomputePost } from "../settings/recompute-distances/route";

let houseA = 0;
let houseB = 0;
let flatA = 0;
let flatB = 0;
let locA = 0;
let locB1 = 0;
let locB2 = 0;

function idParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function rowById(id: number) {
  const rows = await db
    .select()
    .from(apartments)
    .where(eq(apartments.id, id))
    .limit(1);
  return rows[0];
}

beforeEach(async () => {
  vi.clearAllMocks();

  await db.delete(apartmentDistances);
  await db.delete(ratings);
  await db.delete(apartments);
  await db.delete(locationsOfInterest);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);

  await db.insert(users).values([
    { id: "ua", email: "a@example.com", name: "Ann" },
    { id: "ub", email: "b@example.com", name: "Bob" },
  ]);
  const [a] = await db
    .insert(households)
    .values({ name: "A", ownerId: "ua" })
    .returning();
  const [b] = await db
    .insert(households)
    .values({ name: "B", ownerId: "ub" })
    .returning();
  houseA = a.id;
  houseB = b.id;
  await db.insert(householdMembers).values([
    { householdId: houseA, userId: "ua", role: "owner" },
    { householdId: houseB, userId: "ub", role: "owner" },
  ]);

  const [fa] = await db
    .insert(apartments)
    .values({
      name: "A flat",
      householdId: houseA,
      address: "A street 1",
      listingUrl: "https://example.com/a",
      pdfUrl: "/api/uploads/households/1/a.pdf",
    })
    .returning();
  const [fb] = await db
    .insert(apartments)
    .values({
      name: "B flat",
      householdId: houseB,
      address: "B street 2",
      listingUrl: "https://example.com/b",
      pdfUrl: "/api/uploads/households/2/b.pdf",
    })
    .returning();
  flatA = fa.id;
  flatB = fb.id;

  const [la] = await db
    .insert(locationsOfInterest)
    .values({
      householdId: houseA,
      label: "A work",
      icon: "Train",
      address: "A work st",
      sortOrder: 0,
    })
    .returning();
  const [lb1] = await db
    .insert(locationsOfInterest)
    .values({
      householdId: houseB,
      label: "B work",
      icon: "Train",
      address: "B work st",
      sortOrder: 0,
    })
    .returning();
  const [lb2] = await db
    .insert(locationsOfInterest)
    .values({
      householdId: houseB,
      label: "B gym",
      icon: "Bus",
      address: "B gym st",
      sortOrder: 1,
    })
    .returning();
  locA = la.id;
  locB1 = lb1.id;
  locB2 = lb2.id;

  await db.insert(apartmentDistances).values([
    { householdId: houseA, apartmentId: flatA, locationId: locA, bikeMin: 1 },
    { householdId: houseB, apartmentId: flatB, locationId: locB1, bikeMin: 2 },
  ]);

  await db.insert(ratings).values([
    { householdId: houseA, apartmentId: flatA, userId: "ua", overallFeeling: 4 },
    { householdId: houseB, apartmentId: flatB, userId: "ub", overallFeeling: 5 },
  ]);

  // Every test runs as household A's owner unless it says otherwise.
  currentSession.householdId = houseA;
  currentSession.userId = "ua";
});

describe("list endpoints return only the caller's household", () => {
  it("GET /api/apartments", async () => {
    const body = await (await apartmentsGet()).json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("A flat");
    // The rating average and myRating come from A's own rating, not B's.
    expect(body[0].myRating).toBe(4);
    expect(body[0].distances).toEqual([
      { locationId: locA, bikeMin: 1, transitMin: null },
    ]);
  });

  it("GET /api/locations", async () => {
    const body = await (await locationsGet()).json();
    expect(body.map((l: { label: string }) => l.label)).toEqual(["A work"]);
  });

  it("GET /api/apartments/[id] reads the caller's own row", async () => {
    const res = await apartmentGet(new Request("http://x"), idParams(flatA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("A flat");
    // Only A's rating and distance come back.
    expect(body.ratings).toHaveLength(1);
    expect(body.ratings[0].userId).toBe("ua");
    expect(body.distances).toHaveLength(1);
  });
});

describe("writes land in the caller's household", () => {
  it("POST /api/apartments stamps the session household", async () => {
    const res = await apartmentsPost(
      jsonRequest("http://x/api/apartments", { name: "New A flat" })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.householdId).toBe(houseA);
  });

  it("POST /api/apartments rejects a pdfUrl from another household", async () => {
    const res = await apartmentsPost(
      jsonRequest("http://x/api/apartments", {
        name: "Pointer",
        pdfUrl: `/api/uploads/households/${houseB}/theirs.pdf`,
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/household/i);
    // Nothing was written: no dangling pointer into their namespace.
    expect(await db.select().from(apartments)).toHaveLength(2);
  });

  it("POST /api/apartments accepts a pdfUrl in the caller's own household", async () => {
    const res = await apartmentsPost(
      jsonRequest("http://x/api/apartments", {
        name: "Mine",
        pdfUrl: `/api/uploads/households/${houseA}/mine.pdf`,
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).pdfUrl).toBe(
      `/api/uploads/households/${houseA}/mine.pdf`
    );
  });

  it("POST /api/apartments rejects a pdfUrl that percent-encodes its way out", async () => {
    // The cloud branch is canonicalized through the URL parser before the
    // check, the same way readStoredFile does it — checking the raw string
    // and resolving a different one is what the Task 4 bypass exploited.
    const res = await apartmentsPost(
      jsonRequest("http://x/api/apartments", {
        name: "Sneaky",
        pdfUrl: `/api/pdf/households/${houseA}/%2e%2e/${houseB}/theirs.pdf`,
      })
    );
    expect(res.status).toBe(400);
    expect(await db.select().from(apartments)).toHaveLength(2);
  });

  it("POST /api/locations stamps the session household", async () => {
    const res = await locationsPost(
      jsonRequest("http://x/api/locations", {
        label: "New",
        icon: "Bus",
        address: "Somewhere",
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).householdId).toBe(houseA);
  });

  it("POST /api/apartments/[id]/ratings keys the rating to the session user", async () => {
    const res = await ratingPost(
      jsonRequest("http://x", { overallFeeling: 2, comment: "meh" }),
      idParams(flatA)
    );
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.userId).toBe("ua");
    expect(saved.householdId).toBe(houseA);
  });
});

describe("by-id operations on another household's rows answer 404 and change nothing", () => {
  it("GET /api/apartments/[id]", async () => {
    const res = await apartmentGet(new Request("http://x"), idParams(flatB));
    expect(res.status).toBe(404);
    // 404, never 403: a 403 would confirm the row exists somewhere else.
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("PATCH /api/apartments/[id]", async () => {
    const res = await apartmentPatch(
      jsonRequest("http://x", { name: "PWNED", address: "PWNED st" }, "PATCH"),
      idParams(flatB)
    );
    expect(res.status).toBe(404);
    const after = await rowById(flatB);
    expect(after.name).toBe("B flat");
    expect(after.address).toBe("B street 2");
  });

  it("DELETE /api/apartments/[id]", async () => {
    const res = await apartmentDelete(new Request("http://x"), idParams(flatB));
    expect(res.status).toBe(404);
    expect(await db.select().from(apartments)).toHaveLength(2);
    expect(await rowById(flatB)).toBeDefined();
  });

  it("POST /api/apartments/[id]/ratings", async () => {
    const res = await ratingPost(
      jsonRequest("http://x", { overallFeeling: 1, comment: "sabotage" }),
      idParams(flatB)
    );
    expect(res.status).toBe(404);
    const theirRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.apartmentId, flatB));
    expect(theirRatings).toHaveLength(1);
    expect(theirRatings[0].userId).toBe("ub");
  });

  // Regression test for the exploit proved during Task 4's review: a
  // household-1 caller POSTing /api/apartments/<id belonging to household 2>
  // /reprocess got 200, the victim's full row plus freshly re-extracted PDF
  // content in the response, and an overwrite of their apartments row and
  // apartment_distances. The lookup filtered on the id alone, and the
  // ownership check passed apt.householdId — read off the attacker-selected
  // row — into readStoredFile, so it compared request-derived data against
  // request-derived data and could never fail.
  it("POST /api/apartments/[id]/reprocess (the Task 4 exploit)", async () => {
    const before = await rowById(flatB);

    const res = await reprocessPost(new Request("http://x"), idParams(flatB));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
    // No PDF was read and no extraction was run: the victim's document
    // content never reached the response, and no paid API call was made.
    expect(readStoredFile).not.toHaveBeenCalled();
    expect(extractApartmentData).not.toHaveBeenCalled();

    const after = await rowById(flatB);
    expect(after).toEqual(before);
    const theirDistances = await db
      .select()
      .from(apartmentDistances)
      .where(eq(apartmentDistances.apartmentId, flatB));
    expect(theirDistances).toHaveLength(1);
    expect(theirDistances[0].bikeMin).toBe(2);
  });

  it("reprocess on the caller's OWN row still works (the 404 above is scoping, not breakage)", async () => {
    const res = await reprocessPost(new Request("http://x"), idParams(flatA));
    expect(res.status).toBe(200);
    expect(extractApartmentData).toHaveBeenCalled();
    // readStoredFile is handed the SESSION's household, never the row's.
    expect(readStoredFile).toHaveBeenCalledWith(
      "/api/uploads/households/1/a.pdf",
      houseA
    );
    expect((await rowById(flatA)).name).toBe("REPROCESSED");
    expect((await rowById(flatB)).name).toBe("B flat");
  });

  it("GET /api/locations/[id]", async () => {
    const res = await locationGet(new Request("http://x"), idParams(locB1));
    expect(res.status).toBe(404);
  });

  it("PUT /api/locations/[id]", async () => {
    const res = await locationPut(
      jsonRequest("http://x", { label: "PWNED" }, "PUT"),
      idParams(locB1)
    );
    expect(res.status).toBe(404);
    const [row] = await db
      .select()
      .from(locationsOfInterest)
      .where(eq(locationsOfInterest.id, locB1));
    expect(row.label).toBe("B work");
  });

  it("DELETE /api/locations/[id]", async () => {
    const res = await locationDelete(new Request("http://x"), idParams(locB1));
    expect(res.status).toBe(404);
    expect(
      await db
        .select()
        .from(locationsOfInterest)
        .where(eq(locationsOfInterest.id, locB1))
    ).toHaveLength(1);
  });

  it("POST /api/locations/[id]/move", async () => {
    const res = await locationMovePost(
      jsonRequest("http://x", { direction: "up" }),
      idParams(locB2)
    );
    expect(res.status).toBe(404);
    const rows = await db
      .select()
      .from(locationsOfInterest)
      .where(eq(locationsOfInterest.householdId, houseB));
    expect(
      rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id)
    ).toEqual([locB1, locB2]);
  });
});

describe("bulk endpoints operate on the caller's household only", () => {
  it("POST /api/apartments/check-listings", async () => {
    const res = await checkListingsPost();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checked: 1, updated: 1 });
    // The checker was only ever handed A's listing.
    expect(checkListings).toHaveBeenCalledWith([
      { id: flatA, listingUrl: "https://example.com/a" },
    ]);
    expect((await rowById(flatA)).listingGone).toBe(true);
    expect((await rowById(flatB)).listingGone).toBe(false);
  });

  it("POST /api/geocode/backfill", async () => {
    const res = await backfillPost();
    expect(res.status).toBe(200);
    // A's apartment + A's location = 2 pending. B's rows are invisible.
    expect(await res.json()).toMatchObject({ pending: 2, updated: 2 });
    expect((await rowById(flatA)).latitude).toBe(1);
    expect((await rowById(flatB)).latitude).toBeNull();
    const [theirLoc] = await db
      .select()
      .from(locationsOfInterest)
      .where(eq(locationsOfInterest.id, locB1));
    expect(theirLoc.latitude).toBeNull();
  });

  it("POST /api/settings/recompute-distances", async () => {
    const res = await recomputePost();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      totalApartments: 1,
      totalLocations: 1,
      updated: 1,
    });
    // B's single distance row is untouched: still bikeMin 2, still one row.
    const theirs = await db
      .select()
      .from(apartmentDistances)
      .where(eq(apartmentDistances.householdId, houseB));
    expect(theirs).toHaveLength(1);
    expect(theirs[0].bikeMin).toBe(2);
  });
});

describe("a removed member's still-valid JWT", () => {
  // The JWT lives up to 24h and keeps naming the household the member was in.
  // Reads may trust it; destructive handlers re-check the database.
  beforeEach(async () => {
    await db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, houseA),
          eq(householdMembers.userId, "ua")
        )
      );
  });

  it("cannot delete an apartment", async () => {
    const res = await apartmentDelete(new Request("http://x"), idParams(flatA));
    expect(res.status).toBe(404);
    expect(await rowById(flatA)).toBeDefined();
  });

  it("cannot patch an apartment", async () => {
    const res = await apartmentPatch(
      jsonRequest("http://x", { name: "PWNED" }, "PATCH"),
      idParams(flatA)
    );
    expect(res.status).toBe(404);
    expect((await rowById(flatA)).name).toBe("A flat");
  });

  it("cannot reprocess an apartment", async () => {
    const res = await reprocessPost(new Request("http://x"), idParams(flatA));
    expect(res.status).toBe(404);
    expect(extractApartmentData).not.toHaveBeenCalled();
    expect((await rowById(flatA)).name).toBe("A flat");
  });

  it("cannot delete, edit or reorder a location", async () => {
    expect(
      (await locationDelete(new Request("http://x"), idParams(locA))).status
    ).toBe(404);
    expect(
      (
        await locationPut(
          jsonRequest("http://x", { label: "PWNED" }, "PUT"),
          idParams(locA)
        )
      ).status
    ).toBe(404);
    expect(
      (
        await locationMovePost(
          jsonRequest("http://x", { direction: "up" }),
          idParams(locA)
        )
      ).status
    ).toBe(404);
    const [row] = await db
      .select()
      .from(locationsOfInterest)
      .where(eq(locationsOfInterest.id, locA));
    expect(row.label).toBe("A work");
  });

  it("cannot check listings — no row is overwritten", async () => {
    const res = await checkListingsPost();
    expect(res.status).toBe(404);
    expect(checkListings).not.toHaveBeenCalled();
    const after = await rowById(flatA);
    expect(after.listingGone).toBe(false);
    expect(after.listingCheckedAt).toBeNull();
  });

  it("cannot run the geocode backfill — no coordinates are written", async () => {
    const res = await backfillPost();
    expect(res.status).toBe(404);
    expect(geocodeLatLngWithReason).not.toHaveBeenCalled();
    expect((await rowById(flatA)).latitude).toBeNull();
    const [loc] = await db
      .select()
      .from(locationsOfInterest)
      .where(eq(locationsOfInterest.id, locA));
    expect(loc.latitude).toBeNull();
  });

  it("cannot recompute distances — the existing rows are untouched", async () => {
    const res = await recomputePost();
    expect(res.status).toBe(404);
    expect(calculateDistance).not.toHaveBeenCalled();
    const rows = await db
      .select()
      .from(apartmentDistances)
      .where(eq(apartmentDistances.householdId, houseA));
    expect(rows).toHaveLength(1);
    expect(rows[0].bikeMin).toBe(1);
  });

  it("cannot create an apartment in the ex-household", async () => {
    const res = await apartmentsPost(
      jsonRequest("http://x/api/apartments", { name: "Ghost flat" })
    );
    expect(res.status).toBe(404);
    expect(await db.select().from(apartments)).toHaveLength(2);
  });

  it("cannot create a location in the ex-household", async () => {
    const res = await locationsPost(
      jsonRequest("http://x/api/locations", {
        label: "Ghost",
        icon: "Bus",
        address: "Nowhere",
      })
    );
    expect(res.status).toBe(404);
    expect(await db.select().from(locationsOfInterest)).toHaveLength(3);
  });

  it("cannot post a rating", async () => {
    const res = await ratingPost(
      jsonRequest("http://x", { overallFeeling: 1 }),
      idParams(flatA)
    );
    expect(res.status).toBe(404);
    expect(
      await db.select().from(ratings).where(eq(ratings.apartmentId, flatA))
    ).toHaveLength(1);
  });
});
