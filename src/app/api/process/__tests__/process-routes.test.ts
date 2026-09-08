// jsdom's Request/FormData implementation mangles a File round-tripped
// through req.formData() (loses the filename, corrupts the byte count for
// binary content) — this suite posts real multipart bodies with binary
// File payloads, so it needs Node's own fetch/undici implementation.
// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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
import { UnauthorizedError } from "@/lib/household";

// Every table either schema module defines — the "touches no table" contract
// (brief) is only real if a write anywhere, not just to `apartments`, would
// fail the test.
async function snapshotRowCounts(): Promise<Record<string, number>> {
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
    // E4's rate limiter is the ONE table a process route may write, and
    // only when PROCESS_RATE_LIMIT_PER_HOUR is set. These tests run with
    // it unset, so this count must stay at zero like every other.
    processUsage: (await db.select().from(processUsage)).length,
    users: (await db.select().from(users)).length,
    accounts: (await db.select().from(accounts)).length,
    sessions: (await db.select().from(sessions)).length,
    verificationTokens: (await db.select().from(verificationTokens)).length,
  };
}

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

const geocodeLatLngWithReason = vi.fn();
const extractPostcode = vi.fn();
vi.mock("@/lib/geocode", () => ({
  geocodeLatLngWithReason: (...a: unknown[]) => geocodeLatLngWithReason(...a),
  extractPostcode: (...a: unknown[]) => extractPostcode(...a),
}));
const calculateDistance = vi.fn();
vi.mock("@/lib/distance", () => ({ calculateDistance: (...a: unknown[]) => calculateDistance(...a) }));
const checkListingUrl = vi.fn();
vi.mock("@/lib/listing-status", () => ({ checkListingUrl: (...a: unknown[]) => checkListingUrl(...a) }));
const extractApartmentData = vi.fn();
vi.mock("@/lib/parse-pdf", () => ({ extractApartmentData: (...a: unknown[]) => extractApartmentData(...a) }));

import { POST as geocodePOST } from "../geocode/route";
import { POST as distancePOST } from "../distance/route";
import { POST as checkListingPOST } from "../check-listing/route";
import { POST as parsePdfPOST } from "../parse-pdf/route";

function json(body: unknown) {
  return new Request("http://localhost/api/process/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function multipart(file: File | null) {
  const fd = new FormData();
  if (file) fd.set("file", file);
  return new Request("http://localhost/api/process/parse-pdf", { method: "POST", body: fd });
}
const pdf = (bytes = 16, name = "listing.pdf", type = "application/pdf") =>
  new File([new Uint8Array(bytes)], name, { type });

let hid: number;
let baselineCounts: Record<string, number>;

const ENVELOPE = JSON.stringify({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "QUJD" });

beforeEach(async () => {
  signedIn = true;
  await db.delete(processUsage);
  await db.delete(ratings);
  await db.delete(locations);
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com", name: "o" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(apartments).values({
    id: "11111111-1111-4111-8111-111111111111",
    householdId: hid,
    envelope: ENVELOPE,
  });
  // Seeded so a stray write to either table (not just `apartments`) would
  // actually change a count the "touches no table" assertion can catch.
  await db.insert(ratings).values({
    householdId: hid,
    apartmentId: "11111111-1111-4111-8111-111111111111",
    userId: "o",
    envelope: ENVELOPE,
  });
  await db.insert(locations).values({
    id: "22222222-2222-4222-8222-222222222222",
    householdId: hid,
    sortOrder: 0,
    envelope: ENVELOPE,
  });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
  baselineCounts = await snapshotRowCounts();
});

afterEach(() => vi.unstubAllEnvs());

// The brief's contract: these routes touch NO table. Compares row counts
// across every table in both schema modules, not just `apartments` — a
// write to `ratings`, `settings`, `member_keys`, an auth table, etc. must
// fail this the same as a write to `apartments` would. The version check is
// kept alongside it because an in-place UPDATE would not change a row count.
async function rowsUnchanged() {
  expect(await snapshotRowCounts()).toEqual(baselineCounts);
  const rows = await db.select().from(apartments);
  expect(rows).toHaveLength(1);
  expect(rows[0].version).toBe(1);
}

describe("POST /api/process/geocode", () => {
  it("401s without a session", async () => {
    signedIn = false;
    expect((await geocodePOST(json({ address: "A" }))).status).toBe(401);
  });

  it("returns coordinates and postcode, writing nothing", async () => {
    geocodeLatLngWithReason.mockResolvedValue({ result: { lat: 47.3, lng: 8.5 } });
    extractPostcode.mockResolvedValue("8001");
    const res = await geocodePOST(json({ address: "Bahnhofstrasse 1, 8001 Zürich" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lat: 47.3, lng: 8.5, postcode: "8001" });
    expect(geocodeLatLngWithReason).toHaveBeenCalledWith("Bahnhofstrasse 1, 8001 Zürich");
    await rowsUnchanged();
  });

  it("returns nulls with a reason when nothing resolves", async () => {
    geocodeLatLngWithReason.mockResolvedValue({ result: null, googleReason: "no_key", orsReason: "no_key" });
    extractPostcode.mockResolvedValue(null);
    const res = await geocodePOST(json({ address: "nowhere" }));
    expect(await res.json()).toEqual({ lat: null, lng: null, postcode: null, reason: "google: no_key; ors: no_key" });
  });

  it("400s an empty address", async () => {
    expect((await geocodePOST(json({ address: "  " }))).status).toBe(400);
  });
});

describe("POST /api/process/distance", () => {
  it("maps the library result to the wire names", async () => {
    calculateDistance.mockResolvedValue({ bikeMinutes: 12, transitMinutes: null });
    const res = await distancePOST(json({ from: "A", to: "B" }));
    expect(await res.json()).toEqual({ bikeMin: 12, transitMin: null });
    expect(calculateDistance).toHaveBeenCalledWith("A", "B");
    await rowsUnchanged();
  });

  it("401s without a session and 400s a missing field", async () => {
    signedIn = false;
    expect((await distancePOST(json({ from: "A", to: "B" }))).status).toBe(401);
    signedIn = true;
    expect((await distancePOST(json({ from: "A" }))).status).toBe(400);
  });
});

describe("POST /api/process/check-listing", () => {
  it("returns the gone flag for an http(s) url", async () => {
    checkListingUrl.mockResolvedValue(true);
    const res = await checkListingPOST(json({ url: "https://example.com/x" }));
    expect(await res.json()).toEqual({ gone: true });
    checkListingUrl.mockResolvedValue(null);
    expect(await (await checkListingPOST(json({ url: "http://example.com/x" }))).json()).toEqual({ gone: null });
    await rowsUnchanged();
  });

  it("400s non-http schemes and garbage", async () => {
    expect((await checkListingPOST(json({ url: "file:///etc/passwd" }))).status).toBe(400);
    expect((await checkListingPOST(json({ url: "ftp://example.com/x" }))).status).toBe(400);
    expect((await checkListingPOST(json({ url: "not a url" }))).status).toBe(400);
    expect(checkListingUrl).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await checkListingPOST(json({ url: "https://example.com" }))).status).toBe(401);
  });
});

describe("POST /api/process/parse-pdf", () => {
  it("401s without a session", async () => {
    signedIn = false;
    expect((await parsePdfPOST(multipart(pdf()))).status).toBe(401);
  });

  it("returns the empty extraction when no AI key is set", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    const res = await parsePdfPOST(multipart(pdf(16, "Nice Flat.pdf")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiAvailable).toBe(false);
    expect(body.extracted).toMatchObject({ name: "Nice Flat", address: null, rentChf: null });
    expect(extractApartmentData).not.toHaveBeenCalled();
    await rowsUnchanged();
  });

  it("runs extraction on the bytes when AI is configured", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "k");
    extractApartmentData.mockResolvedValue({ name: "X", address: "A 1", sizeM2: 80, numRooms: 3.5, numBathrooms: 1, numBalconies: 1, hasWashingMachine: true, rentChf: 2000, listingUrl: null, summary: null, availableFrom: null });
    const res = await parsePdfPOST(multipart(pdf(16)));
    expect(res.status).toBe(200);
    expect((await res.json()).extracted.name).toBe("X");
    expect(extractApartmentData).toHaveBeenCalledWith(Buffer.alloc(16).toString("base64"));
    await rowsUnchanged();
  });

  it("400s a non-PDF and 413s an oversized file", async () => {
    expect((await parsePdfPOST(multipart(null))).status).toBe(400);
    expect((await parsePdfPOST(multipart(pdf(16, "x.txt", "text/plain")))).status).toBe(400);
    vi.stubEnv("PARSE_PDF_MAX_BYTES", "8");
    const res = await parsePdfPOST(multipart(pdf(16)));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("PDF too large to extract");
  });

  it("classifies AI failures like the old route did", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "k");
    extractApartmentData.mockRejectedValue(Object.assign(new Error("quota exceeded, retry after 30s"), { status: 429 }));
    const res = await parsePdfPOST(multipart(pdf(16)));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ reason: "quota", retryAfterSeconds: 30 });
  });
});

// E4: "Rate limited per account — these endpoints spend the host's money."
describe("rate limiting (#186)", () => {
  const ORIGINAL = process.env.PROCESS_RATE_LIMIT_PER_HOUR;
  afterEach(async () => {
    if (ORIGINAL === undefined) delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
    else process.env.PROCESS_RATE_LIMIT_PER_HOUR = ORIGINAL;
    await db.delete(processUsage);
  });

  it("answers 429 once the household's hourly allowance is spent", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "2";
    currentSession.householdId = hid;
    currentSession.userId = "o";
    geocodeLatLngWithReason.mockResolvedValue({ result: { lat: 1, lng: 2 } });
    extractPostcode.mockResolvedValue("8001");

    for (let i = 0; i < 2; i++) {
      const ok = await geocodePOST(json({ address: "Bahnhofstrasse 1" }));
      expect(ok.status, `call ${i + 1}`).toBe(200);
    }
    const limited = await geocodePOST(json({ address: "Bahnhofstrasse 1" }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Rate limit exceeded" });
  });

  it("does not call the third-party provider once limited", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "1";
    currentSession.householdId = hid;
    currentSession.userId = "o";
    geocodeLatLngWithReason.mockResolvedValue({ result: { lat: 1, lng: 2 } });
    extractPostcode.mockResolvedValue("8001");

    await geocodePOST(json({ address: "Bahnhofstrasse 1" }));
    geocodeLatLngWithReason.mockClear();
    const limited = await geocodePOST(json({ address: "Bahnhofstrasse 1" }));

    expect(limited.status).toBe(429);
    // The point of the limit is spend, so the refusal must come BEFORE the
    // outbound call, not after it.
    expect(geocodeLatLngWithReason).not.toHaveBeenCalled();
  });

  it("writes nothing to process_usage when no limit is configured", async () => {
    delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
    currentSession.householdId = hid;
    currentSession.userId = "o";
    geocodeLatLngWithReason.mockResolvedValue({ result: { lat: 1, lng: 2 } });
    extractPostcode.mockResolvedValue("8001");

    for (let i = 0; i < 5; i++) {
      expect((await geocodePOST(json({ address: "Bahnhofstrasse 1" }))).status).toBe(200);
    }
    expect(await db.select().from(processUsage)).toHaveLength(0);
  });
});
