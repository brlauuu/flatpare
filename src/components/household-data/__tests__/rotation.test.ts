import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import "fake-indexeddb/auto";
import {
  clearKeys,
  deriveKek,
  envelopeAad,
  exportPublicKey,
  fromBase64,
  generateDataKey,
  generateMemberKeypair,
  loadKeys,
  normalizeRecoveryCode,
  open,
  openBytes,
  seal,
  sealBytes,
  randomSalt,
  toStoredDataKey,
  unwrapDataKey,
  unwrapDataKeyWithKek,
  unwrapPrivateKey,
  wrapPrivateKey,
  type StoredKeys,
} from "@/lib/crypto";
import { TEST_KDF_PARAMS } from "@/lib/crypto/__tests__/params";
import type { StatusResponse } from "@/components/crypto/flows";
import { emptyApartment, EMPTY_RATING, type Apartment } from "@/lib/household-data/types";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";
import { ApiClientError } from "../api-client";
import { _resetBlobModeProbeForTests } from "@/lib/upload-pdf";
import { isStaleKey, runRotateDataKey } from "../rotation";

// End to end against a fake server, with real keys: the owner rotates, then
// a member's private key must open the new wrap and that key must open the
// re-sealed rows and the re-encrypted PDF.

const HID = 5;
const A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);

type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>;

interface Server {
  keyVersion: number;
  members: { userId: string; publicKey: string }[];
  apartments: Map<string, ApartmentRow>;
  ratings: Map<string, RatingRow>;
  locations: Map<string, LocationRow>;
  files: Map<string, Uint8Array<ArrayBuffer>>;
  lastRotate: Record<string, unknown> | null;
  rotatePosts: number;
  // Test hooks.
  failFirstRotateWithStaleRows: boolean;
  onFirstRotateBumpApartment: string | null;
}

let server: Server;
let ownerKeys: StoredKeys;
let memberPair: CryptoKeyPair;
let oldDataKey: CryptoKey;

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function status(over: Partial<StatusResponse> = {}): StatusResponse {
  return {
    mode: "on",
    userId: "o",
    householdId: HID,
    role: "owner",
    memberKeys: null,
    wrap: "unused",
    wrapKeyVersion: 1,
    keyVersion: 1,
    rotationDue: true,
    householdHasWraps: true,
    othersHaveWraps: true,
    recovery: null,
    ...over,
  };
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = input;
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
      if (url === "/api/crypto/rotate" && method === "GET") {
        return json({ keyVersion: server.keyVersion, members: server.members });
      }
      if (url === "/api/crypto/rotate" && method === "POST") {
        server.rotatePosts++;
        if (server.failFirstRotateWithStaleRows && server.rotatePosts === 1) {
          if (server.onFirstRotateBumpApartment) {
            const row = server.apartments.get(server.onFirstRotateBumpApartment)!;
            server.apartments.set(row.id, { ...row, version: row.version + 1 });
          }
          return json({ error: "Stale rows" }, 409);
        }
        if (body.fromKeyVersion !== server.keyVersion) {
          return json({ error: "Stale key", keyVersion: server.keyVersion }, 409);
        }
        server.lastRotate = body;
        server.keyVersion = body.fromKeyVersion + 1;
        for (const a of body.apartments) {
          if (a.envelope === null) continue;
          const row = server.apartments.get(a.id)!;
          server.apartments.set(a.id, { ...row, envelope: a.envelope, version: row.version + 1 });
        }
        for (const r of body.ratings) {
          if (r.envelope === null) continue;
          const key = `${r.apartmentId}:${r.userId}`;
          server.ratings.set(key, { ...server.ratings.get(key)!, envelope: r.envelope });
        }
        for (const l of body.locations) {
          if (l.envelope === null) continue;
          server.locations.set(l.id, { ...server.locations.get(l.id)!, envelope: l.envelope });
        }
        for (const p of body.retiredPdfPaths) server.files.delete(p);
        return json({ keyVersion: server.keyVersion });
      }
      if (url === "/api/apartments" && method === "GET") return json([...server.apartments.values()]);
      if (url === "/api/ratings" && method === "GET") return json([...server.ratings.values()]);
      if (url === "/api/locations" && method === "GET") return json([...server.locations.values()]);
      if (url === "/api/files/upload-token") return json({ enabled: false }, 404);
      if (url === "/api/files" && method === "POST") {
        const form = init?.body as FormData;
        const name = (form.get("file") as File).name;
        const path = `/api/uploads/households/${HID}/${name}`;
        server.files.set(path, new Uint8Array(await (form.get("file") as Blob).arrayBuffer()));
        return json({ path }, 201);
      }
      const file = server.files.get(url);
      if (file && method === "GET") return new Response(file.slice().buffer, { status: 200 });
      if (url.startsWith("/api/uploads/")) return new Response(null, { status: 404 });
      throw new Error(`unhandled ${method} ${url}`);
    })
  );
}

async function sealRow(table: string, id: string, data: unknown) {
  return seal(oldDataKey, data, envelopeAad(HID, table, id), 1);
}

beforeEach(async () => {
  _resetBlobModeProbeForTests();
  await clearKeys();
  oldDataKey = await generateDataKey();
  memberPair = await generateMemberKeypair();
  const ownerPair = await generateMemberKeypair();
  // The device store holds a NON-extractable private key (it refuses
  // anything else), which the real flows get by unwrapping; do the same.
  const kek = await deriveKek("owner passphrase", randomSalt(), TEST_KDF_PARAMS);
  const storedPrivate = await unwrapPrivateKey(await wrapPrivateKey(ownerPair.privateKey, kek), kek);
  ownerKeys = {
    userId: "o",
    householdId: HID,
    privateKey: storedPrivate,
    dataKey: await toStoredDataKey(oldDataKey),
    keyVersion: 1,
  };

  // A PDF sealed under the old key, stored on the fake server.
  const sealedPdf = await sealBytes(oldDataKey, PDF_BYTES, envelopeAad(HID, "pdf", A1));
  const pdfPath = `/api/uploads/households/${HID}/${A1}.pdf.enc`;

  const a1: Apartment = { ...emptyApartment("One"), pdf: { path: pdfPath, iv: sealedPdf.iv } };
  const a2: Apartment = emptyApartment("Two");
  server = {
    keyVersion: 1,
    members: [
      { userId: "o", publicKey: await exportPublicKey(ownerPair.publicKey) },
      { userId: "m", publicKey: await exportPublicKey(memberPair.publicKey) },
    ],
    apartments: new Map([
      [A1, { id: A1, version: 3, envelope: await sealRow("apartments", A1, a1), createdAt: "", updatedAt: "" }],
      [A2, { id: A2, version: 1, envelope: await sealRow("apartments", A2, a2), createdAt: "", updatedAt: "" }],
    ]),
    ratings: new Map([
      [`${A1}:o`, { apartmentId: A1, userId: "o", userName: "Ana", envelope: await sealRow("ratings", `${A1}:o`, { ...EMPTY_RATING, kitchen: 4 }), updatedAt: "" }],
    ]),
    locations: new Map([
      [L1, { id: L1, sortOrder: 0, envelope: await sealRow("locations", L1, { label: "Work", icon: "briefcase", address: "X", latitude: null, longitude: null }), createdAt: "", updatedAt: "" }],
    ]),
    files: new Map([[pdfPath, sealedPdf.ct]]),
    lastRotate: null,
    rotatePosts: 0,
    failFirstRotateWithStaleRows: false,
    onFirstRotateBumpApartment: null,
  };
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runRotateDataKey", () => {
  it("re-seals every row and PDF under a key every member can unwrap, and mints a new kit", async () => {
    const { recoveryCode, report } = await runRotateDataKey(status(), ownerKeys, {
      kdfParams: TEST_KDF_PARAMS,
    });

    expect(report).toEqual({ keyVersion: 2, rows: 4, pdfs: 1, pdfFailures: [] });
    expect(server.keyVersion).toBe(2);
    const sent = server.lastRotate as {
      wraps: { userId: string; wrappedKey: string; publicKey: string }[];
      recovery: { wrappedKey: string; iv: string; kdf: { salt: string; memoryKib: number; iterations: number; parallelism: number; version: 1 } };
      retiredPdfPaths: string[];
    };

    // The member's private key opens their wrap, and that key opens the rows.
    const memberWrap = sent.wraps.find((w) => w.userId === "m")!;
    const newKey = await unwrapDataKey(memberWrap.wrappedKey, memberPair.privateKey);
    const row1 = server.apartments.get(A1)!;
    expect(row1.version).toBe(4);
    expect(row1.envelope.v === 1 && row1.envelope.k).toBe(2);
    const opened = (await open(newKey, row1.envelope, envelopeAad(HID, "apartments", A1))) as Apartment;
    expect(opened.name).toBe("One");
    expect(opened.pdf?.path).toBe(`/api/uploads/households/${HID}/${A1}.k2.pdf.enc`);
    const rating = server.ratings.get(`${A1}:o`)!;
    expect(await open(newKey, rating.envelope, envelopeAad(HID, "ratings", `${A1}:o`))).toMatchObject({ kitchen: 4 });
    const loc = server.locations.get(L1)!;
    expect(await open(newKey, loc.envelope, envelopeAad(HID, "locations", L1))).toMatchObject({ label: "Work" });

    // The PDF was re-encrypted under the new key at the versioned path, and
    // the old file was retired.
    const ct = server.files.get(opened.pdf!.path)!;
    const pdf = await openBytes(newKey, { iv: opened.pdf!.iv, ct }, envelopeAad(HID, "pdf", A1));
    expect([...pdf]).toEqual([...PDF_BYTES]);
    expect(sent.retiredPdfPaths).toEqual([`/api/uploads/households/${HID}/${A1}.pdf.enc`]);
    expect(server.files.has(`/api/uploads/households/${HID}/${A1}.pdf.enc`)).toBe(false);

    // The old key opens nothing any more.
    await expect(open(oldDataKey, row1.envelope, envelopeAad(HID, "apartments", A1))).rejects.toThrow();

    // The new recovery code unwraps the new key.
    const compact = normalizeRecoveryCode(recoveryCode)!;
    const kek = await deriveKek(compact, fromBase64(sent.recovery.kdf.salt), sent.recovery.kdf);
    const fromKit = await unwrapDataKeyWithKek({ wrapped: sent.recovery.wrappedKey, iv: sent.recovery.iv }, kek);
    expect(await open(fromKit, row1.envelope, envelopeAad(HID, "apartments", A1))).toMatchObject({ name: "One" });

    // The device now holds the new key at the new version.
    const stored = await loadKeys("o", HID);
    expect(stored?.keyVersion).toBe(2);
    expect(await open(stored!.dataKey!, row1.envelope, envelopeAad(HID, "apartments", A1))).toMatchObject({ name: "One" });
  });

  it("passes a corrupt row through untouched", async () => {
    const row = server.apartments.get(A2)!;
    server.apartments.set(A2, { ...row, envelope: { v: 1, k: 1, iv: row.envelope.v === 1 ? row.envelope.iv : "", ct: "QUJD" } });

    const { report } = await runRotateDataKey(status(), ownerKeys, { kdfParams: TEST_KDF_PARAMS });

    expect(report.rows).toBe(3);
    const sent = server.lastRotate as { apartments: { id: string; envelope: unknown }[] };
    expect(sent.apartments.find((a) => a.id === A2)?.envelope).toBeNull();
    expect(server.apartments.get(A2)!.version).toBe(1);
  });

  it("keeps the old PDF reference when the file cannot be fetched, and reports it", async () => {
    server.files.clear();
    const { report } = await runRotateDataKey(status(), ownerKeys, { kdfParams: TEST_KDF_PARAMS });
    expect(report.pdfFailures).toEqual([A1]);
    expect(report.pdfs).toBe(0);
    const sent = server.lastRotate as { retiredPdfPaths: string[]; wraps: { userId: string; wrappedKey: string }[] };
    expect(sent.retiredPdfPaths).toEqual([]);
    const newKey = await unwrapDataKey(sent.wraps.find((w) => w.userId === "m")!.wrappedKey, memberPair.privateKey);
    const opened = (await open(newKey, server.apartments.get(A1)!.envelope, envelopeAad(HID, "apartments", A1))) as Apartment;
    expect(opened.pdf?.path).toBe(`/api/uploads/households/${HID}/${A1}.pdf.enc`);
  });

  it("retries once on Stale rows, re-reading the moved row and reusing the uploaded PDF", async () => {
    server.failFirstRotateWithStaleRows = true;
    server.onFirstRotateBumpApartment = A2;
    const fetchMock = fetch as unknown as FetchMock;

    const { report } = await runRotateDataKey(status(), ownerKeys, { kdfParams: TEST_KDF_PARAMS });

    expect(report.keyVersion).toBe(2);
    expect(server.rotatePosts).toBe(2);
    const sent = server.lastRotate as { apartments: { id: string; version: number }[] };
    expect(sent.apartments.find((a) => a.id === A2)?.version).toBe(2);
    const uploads = fetchMock.mock.calls.filter((c) => c[0] === "/api/files" && c[1]?.method === "POST");
    expect(uploads).toHaveLength(1);
  });

  it("does not retry on Stale key", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    const original = fetchMock.getMockImplementation()!;
    // Someone rotates between GET and POST.
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === "/api/crypto/rotate" && init?.method === "POST") {
        return json({ error: "Stale key", keyVersion: 2 }, 409);
      }
      return original(input, init);
    });
    await expect(runRotateDataKey(status(), ownerKeys, { kdfParams: TEST_KDF_PARAMS })).rejects.toThrow(/Stale key/);
    expect((await loadKeys("o", HID))).toBeNull(); // nothing persisted
  });

  it("refuses a non-owner, a device without the key, and a device holding an older version", async () => {
    await expect(runRotateDataKey(status({ role: "member" }), ownerKeys)).rejects.toThrow(/Only the owner/);
    await expect(runRotateDataKey(status(), { ...ownerKeys, dataKey: null })).rejects.toThrow(/do not hold/);
    server.keyVersion = 2;
    await expect(runRotateDataKey(status(), ownerKeys)).rejects.toThrow(/older household key/);
    expect(server.rotatePosts).toBe(0);
  });
});

describe("isStaleKey", () => {
  it("matches only the 409 Stale key answer", () => {
    expect(isStaleKey(new ApiClientError(409, "Stale key", { keyVersion: 2 }))).toBe(true);
    expect(isStaleKey(new ApiClientError(409, "Stale version", {}))).toBe(false);
    expect(isStaleKey(new ApiClientError(400, "Stale key", {}))).toBe(false);
    expect(isStaleKey(new Error("Stale key"))).toBe(false);
  });
});
