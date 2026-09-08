// @vitest-environment node
//
// E4's negative assertions, in one place.
//
// The /api/process/* routes are the documented privacy exception: they are
// handed plaintext the user actively submits, so that the server can call
// Gemini or Google Maps on their behalf. The spec's requirements are that
// none of it reaches a log on ANY path including errors, and that none of it
// is persisted at any layer. Both are properties of the whole request, not of
// one function, so they are asserted here by driving each route end to end
// with a distinctive marker and watching every console channel at once.
//
// If this file fails, the finding is real: fix the leak, not the test.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  apartments,
  households,
  householdMembers,
  settings,
  memberKeys,
  householdKeyWraps,
  invitations,
  ratings,
  locations,
  processUsage,
} from "@/lib/db/schema";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema-auth";

// Markers chosen to be unmistakable in any serialization.
const ADDRESS = "Bahnhofstrasse 1, 8001 Zurich";
const LISTING_URL = "https://example.com/secret-listing-42";
const MAPS_KEY = "MAPS-KEY-SHOULD-NEVER-BE-LOGGED";
const GEMINI_KEY = "GEMINI-KEY-SHOULD-NEVER-BE-LOGGED";
const PDF_TEXT = "Mietvertrag Bahnhofstrasse 1 CHF 2400";

const MARKERS = [ADDRESS, "Bahnhofstrasse", LISTING_URL, "secret-listing-42", MAPS_KEY, GEMINI_KEY, PDF_TEXT];

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

const geocodeLatLngWithReason = vi.fn();
const extractPostcode = vi.fn();
vi.mock("@/lib/geocode", () => ({
  geocodeLatLngWithReason: (...a: unknown[]) => geocodeLatLngWithReason(...a),
  extractPostcode: (...a: unknown[]) => extractPostcode(...a),
}));
const calculateDistance = vi.fn();
vi.mock("@/lib/distance", () => ({
  calculateDistance: (...a: unknown[]) => calculateDistance(...a),
}));
const checkListingUrl = vi.fn();
vi.mock("@/lib/listing-status", () => ({
  checkListingUrl: (...a: unknown[]) => checkListingUrl(...a),
}));
const extractApartmentData = vi.fn();
vi.mock("@/lib/parse-pdf", () => ({
  extractApartmentData: (...a: unknown[]) => extractApartmentData(...a),
}));

import { POST as geocodePOST } from "../geocode/route";
import { POST as distancePOST } from "../distance/route";
import { POST as checkListingPOST } from "../check-listing/route";
import { POST as parsePdfPOST } from "../parse-pdf/route";

// A real log drain sees an Error's message and stack. JSON.stringify does
// not (JSON.stringify(new Error("secret")) === "{}"), so asserting over that
// would pass no matter what leaked.
function serialize(calls: unknown[][]): string {
  return calls
    .flat()
    .map((arg) =>
      arg instanceof Error
        ? `${arg.name}: ${arg.message}\n${arg.stack ?? ""}${
            arg.cause ? `\ncause: ${String((arg.cause as Error)?.message ?? arg.cause)}` : ""
          }`
        : typeof arg === "object" && arg !== null
          ? JSON.stringify(arg)
          : String(arg)
    )
    .join("\n");
}

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
function captureConsole() {
  consoleSpies = (["error", "warn", "log", "info", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );
}
function capturedText(): string {
  return consoleSpies.map((s) => serialize(s.mock.calls as unknown[][])).join("\n");
}

async function rowCounts(): Promise<Record<string, number>> {
  return {
    apartments: (await db.select().from(apartments)).length,
    households: (await db.select().from(households)).length,
    householdMembers: (await db.select().from(householdMembers)).length,
    settings: (await db.select().from(settings)).length,
    memberKeys: (await db.select().from(memberKeys)).length,
    householdKeyWraps: (await db.select().from(householdKeyWraps)).length,
    invitations: (await db.select().from(invitations)).length,
    ratings: (await db.select().from(ratings)).length,
    locations: (await db.select().from(locations)).length,
    processUsage: (await db.select().from(processUsage)).length,
    users: (await db.select().from(users)).length,
    accounts: (await db.select().from(accounts)).length,
    sessions: (await db.select().from(sessions)).length,
    verificationTokens: (await db.select().from(verificationTokens)).length,
  };
}

function json(body: unknown) {
  return new Request("http://localhost/api/process/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function multipartPdf() {
  const fd = new FormData();
  fd.set("file", new File([new TextEncoder().encode(PDF_TEXT)], "listing.pdf", {
    type: "application/pdf",
  }));
  return new Request("http://localhost/api/process/parse-pdf", { method: "POST", body: fd });
}

let baseline: Record<string, number>;
const ORIGINAL_LIMIT = process.env.PROCESS_RATE_LIMIT_PER_HOUR;

beforeEach(async () => {
  await db.delete(processUsage);
  await db.delete(ratings);
  await db.delete(locations);
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com", name: "o" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  await db.insert(householdMembers).values({ householdId: h.id, userId: "o", role: "owner" });
  currentSession.householdId = h.id;
  currentSession.userId = "o";

  process.env.GOOGLE_MAPS_API_KEY = MAPS_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = GEMINI_KEY;
  delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;

  baseline = await rowCounts();
  captureConsole();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (ORIGINAL_LIMIT === undefined) delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
  else process.env.PROCESS_RATE_LIMIT_PER_HOUR = ORIGINAL_LIMIT;
});

function expectNoMarkers(where: string) {
  const text = capturedText();
  for (const marker of MARKERS) {
    expect(text, `${where} leaked "${marker}"`).not.toContain(marker);
  }
}

async function expectNoWrites(where: string) {
  expect(await rowCounts(), where).toEqual(baseline);
}

// An error whose message is the outbound URL — the realistic shape of a
// fetch failure, and the one that carries both the address and the key.
const leakyFetchError = () =>
  new TypeError(
    `fetch failed: https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      ADDRESS
    )}&key=${MAPS_KEY}`
  );

describe("geocode", () => {
  it("leaks nothing on success", async () => {
    geocodeLatLngWithReason.mockResolvedValue({ result: { lat: 47.3, lng: 8.5 } });
    extractPostcode.mockResolvedValue("8001");
    const res = await geocodePOST(json({ address: ADDRESS }));
    expect(res.status).toBe(200);
    expectNoMarkers("geocode success");
    await expectNoWrites("geocode success");
  });

  it("leaks nothing when the geocoder finds nothing", async () => {
    geocodeLatLngWithReason.mockResolvedValue({ result: null, googleReason: "ZERO_RESULTS" });
    extractPostcode.mockResolvedValue(null);
    const res = await geocodePOST(json({ address: ADDRESS }));
    expect(res.status).toBe(200);
    expectNoMarkers("geocode no-result");
    await expectNoWrites("geocode no-result");
  });

  it("leaks nothing when the provider call throws", async () => {
    geocodeLatLngWithReason.mockRejectedValue(leakyFetchError());
    extractPostcode.mockResolvedValue(null);
    const res = await geocodePOST(json({ address: ADDRESS }));
    expect(res.status).toBe(500);
    expectNoMarkers("geocode throw");
    await expectNoWrites("geocode throw");
  });
});

describe("distance", () => {
  it("leaks nothing on success", async () => {
    calculateDistance.mockResolvedValue({ bikeMinutes: 12, transitMinutes: 20 });
    const res = await distancePOST(json({ from: ADDRESS, to: "Hauptbahnhof" }));
    expect(res.status).toBe(200);
    expectNoMarkers("distance success");
    await expectNoWrites("distance success");
  });

  it("leaks nothing when the provider call throws", async () => {
    calculateDistance.mockRejectedValue(leakyFetchError());
    const res = await distancePOST(json({ from: ADDRESS, to: "Hauptbahnhof" }));
    expect(res.status).toBe(500);
    expectNoMarkers("distance throw");
    await expectNoWrites("distance throw");
  });
});

describe("check-listing", () => {
  it("leaks nothing on success", async () => {
    checkListingUrl.mockResolvedValue(true);
    const res = await checkListingPOST(json({ url: LISTING_URL }));
    expect(res.status).toBe(200);
    expectNoMarkers("check-listing success");
    await expectNoWrites("check-listing success");
  });

  it("leaks nothing when the probe throws", async () => {
    checkListingUrl.mockRejectedValue(new TypeError(`fetch failed: ${LISTING_URL}`));
    const res = await checkListingPOST(json({ url: LISTING_URL }));
    expect(res.status).toBe(500);
    expectNoMarkers("check-listing throw");
    await expectNoWrites("check-listing throw");
  });
});

describe("parse-pdf", () => {
  it("leaks nothing on success", async () => {
    extractApartmentData.mockResolvedValue({ name: "Flat" });
    const res = await parsePdfPOST(multipartPdf());
    expect(res.status).toBe(200);
    expectNoMarkers("parse-pdf success");
    await expectNoWrites("parse-pdf success");
  });

  it("leaks nothing when extraction throws", async () => {
    // The AI provider's error text is not provably free of request-derived
    // content — a content-policy error can echo a snippet of the input.
    extractApartmentData.mockRejectedValue(new Error(`content rejected: ${PDF_TEXT}`));
    const res = await parsePdfPOST(multipartPdf());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expectNoMarkers("parse-pdf throw");
    await expectNoWrites("parse-pdf throw");
  });
});

describe("the whole surface at once", () => {
  it("writes to no table on any route, success or failure", async () => {
    geocodeLatLngWithReason.mockResolvedValue({ result: { lat: 1, lng: 2 } });
    extractPostcode.mockResolvedValue("8001");
    calculateDistance.mockResolvedValue({ bikeMinutes: 1, transitMinutes: 2 });
    checkListingUrl.mockResolvedValue(false);
    extractApartmentData.mockResolvedValue({ name: "Flat" });

    await geocodePOST(json({ address: ADDRESS }));
    await distancePOST(json({ from: ADDRESS, to: "X" }));
    await checkListingPOST(json({ url: LISTING_URL }));
    await parsePdfPOST(multipartPdf());

    geocodeLatLngWithReason.mockRejectedValue(leakyFetchError());
    calculateDistance.mockRejectedValue(leakyFetchError());
    checkListingUrl.mockRejectedValue(leakyFetchError());
    extractApartmentData.mockRejectedValue(leakyFetchError());

    await geocodePOST(json({ address: ADDRESS }));
    await distancePOST(json({ from: ADDRESS, to: "X" }));
    await checkListingPOST(json({ url: LISTING_URL }));
    await parsePdfPOST(multipartPdf());

    expectNoMarkers("full sweep");
    await expectNoWrites("full sweep");
  });
});
