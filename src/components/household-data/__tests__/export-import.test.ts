import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unzipSync } from "fflate";
import { generateDataKey, sealBytes, envelopeAad, type Envelope } from "@/lib/crypto";
import { openApartment, openLocation, openRating } from "@/lib/household-data/codec";
import { planImport, type RatingLine } from "@/lib/household-data/export-format";
import {
  emptyApartment,
  EMPTY_RATING,
  type Apartment,
  type DecodedApartment,
  type DecodedLocation,
  type DecodedRating,
} from "@/lib/household-data/types";
import { _resetBlobModeProbeForTests } from "@/lib/upload-pdf";
import { downloadPdf } from "../pdf-files";
import { buildExportZip, exportFileName, readExportFile, runImport } from "../export-import";

// End to end with real keys against a fake server: household 5 exports,
// household 9 — a different data key — imports, and everything opens there:
// rows, ratings and the PDF, under the new key and the new household's AAD.

const FROM = 5;
const TO = 9;
const A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);

interface Stored {
  apartments: Map<string, { version: number; envelope: Envelope }>;
  locations: Map<string, Envelope>;
  ratings: Map<string, Envelope>;
  files: Map<string, Uint8Array<ArrayBuffer>>;
  // Apartment names whose create the server refuses, as a 402 would.
  refuse: Set<string>;
  openKey: CryptoKey | null;
}

let server: Stored;
let fromKey: CryptoKey;
let toKey: CryptoKey;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      if (url === "/api/locations" && method === "POST") {
        server.locations.set(body.id, body.envelope);
        return json({ id: body.id, sortOrder: server.locations.size - 1, envelope: body.envelope }, 201);
      }
      if (url === "/api/apartments" && method === "POST") {
        const data = await openApartment(server.openKey, TO, body.id, body.envelope);
        if (data && server.refuse.has(data.name)) return json({ error: "No apartment credits left" }, 402);
        server.apartments.set(body.id, { version: 1, envelope: body.envelope });
        return json({ id: body.id, version: 1, envelope: body.envelope, createdAt: "", updatedAt: "" }, 201);
      }
      const put = url.match(/^\/api\/apartments\/([^/]+)$/);
      if (put && method === "PUT") {
        const row = server.apartments.get(put[1])!;
        if (row.version !== body.version) return json({ error: "Stale version" }, 409);
        server.apartments.set(put[1], { version: row.version + 1, envelope: body.envelope });
        return json({ id: put[1], version: row.version + 1, envelope: body.envelope, createdAt: "", updatedAt: "" });
      }
      const rate = url.match(/^\/api\/apartments\/([^/]+)\/ratings\/me$/);
      if (rate && method === "PUT") {
        server.ratings.set(`${rate[1]}:u-me`, body.envelope);
        return json({ apartmentId: rate[1], userId: "u-me", userName: "Me", envelope: body.envelope, updatedAt: "" });
      }
      if (url === "/api/files/upload-token") return json({ enabled: false }, 404);
      if (url === "/api/files" && method === "POST") {
        const file = (init?.body as FormData).get("file") as File;
        const path = `/api/uploads/households/${TO}/${file.name}`;
        server.files.set(path, new Uint8Array(await file.arrayBuffer()));
        return json({ path }, 201);
      }
      const file = server.files.get(url);
      if (file && method === "GET") return new Response(file.slice().buffer, { status: 200 });
      if (url.startsWith("/api/uploads/")) return new Response(null, { status: 404 });
      throw new Error(`unhandled ${method} ${url}`);
    })
  );
}

let snapshot: { apartments: DecodedApartment[]; ratings: DecodedRating[]; locations: DecodedLocation[] };

beforeEach(async () => {
  _resetBlobModeProbeForTests();
  fromKey = await generateDataKey();
  toKey = await generateDataKey();
  const sealedPdf = await sealBytes(fromKey, PDF_BYTES, envelopeAad(FROM, "pdf", A1));
  const pdfPath = `/api/uploads/households/${FROM}/${A1}.pdf.enc`;
  server = {
    apartments: new Map(),
    locations: new Map(),
    ratings: new Map(),
    files: new Map([[pdfPath, sealedPdf.ct]]),
    refuse: new Set(),
    openKey: toKey,
  };
  const one: Apartment = {
    ...emptyApartment("One"),
    address: "Main street 1",
    latitude: 47.5,
    longitude: 7.6,
    shortCode: "2R1B",
    distances: { [L1]: { bikeMin: 9, transitMin: 14 } },
    pdf: { path: pdfPath, iv: sealedPdf.iv },
  };
  snapshot = {
    apartments: [
      { id: A1, version: 4, createdAt: "", updatedAt: "", data: one },
      { id: A2, version: 1, createdAt: "", updatedAt: "", data: emptyApartment("Two") },
    ],
    ratings: [
      { apartmentId: A1, userId: "u-me", userName: "Me", updatedAt: "", data: { ...EMPTY_RATING, kitchen: 5, overallFeeling: 4 } },
      { apartmentId: A2, userId: "u-lena", userName: "Lena", updatedAt: "", data: { ...EMPTY_RATING, overallFeeling: 3, comment: "ok" } },
    ],
    locations: [
      { id: L1, sortOrder: 0, data: { label: "Work", icon: "Briefcase", address: "Office 1", latitude: 47.4, longitude: 7.5 } },
    ],
  };
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const line: RatingLine = ({ userName, data }) => `Rated by ${userName}: ${data.overallFeeling}/5 "${data.comment}"`;

async function exportAndPlan(userId = "u-me") {
  const { blob } = await buildExportZip(snapshot, { dataKey: fromKey, householdId: FROM, keyVersion: 1 });
  const parsed = await readExportFile(blob);
  return planImport(parsed, userId, () => crypto.randomUUID(), line);
}

describe("buildExportZip", () => {
  it("decrypts the PDF into the ZIP and names the file by date", async () => {
    const { blob, missingPdfs } = await buildExportZip(snapshot, { dataKey: fromKey, householdId: FROM, keyVersion: 1 });
    expect(missingPdfs).toBe(0);
    expect(blob.type).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(files[`pdfs/${A1}.pdf`]).toEqual(PDF_BYTES);
    expect(exportFileName(new Date("2026-10-24T23:00:00Z"))).toBe("flatpare-export-2026-10-24.zip");
  });

  it("counts a PDF it cannot fetch and still exports", async () => {
    server.files.clear();
    const { blob, missingPdfs } = await buildExportZip(snapshot, { dataKey: fromKey, householdId: FROM, keyVersion: 1 });
    expect(missingPdfs).toBe(1);
    const parsed = await readExportFile(blob);
    expect(parsed.manifest.skipped.pdfs).toBe(1);
    expect(parsed.apartments[0].pdf).toBeNull();
  });
});

describe("readExportFile", () => {
  it("refuses something that is not a ZIP", async () => {
    await expect(readExportFile(new Blob(["hello"]))).rejects.toMatchObject({ problem: "not-export" });
  });
});

describe("runImport", () => {
  it("re-seals everything for the new household, which can open it all", async () => {
    const plan = await exportAndPlan();
    const progress: [number, number][] = [];
    const report = await runImport(plan, { dataKey: toKey, householdId: TO, keyVersion: 1, userId: "u-me" }, (d, t) =>
      progress.push([d, t])
    );
    expect(report).toEqual({ locations: 1, apartments: 2, pdfs: 1, ratings: 2, failed: [] });
    expect(progress.at(-1)).toEqual([3, 3]);

    const newLoc = plan.locations[0].id;
    expect(await openLocation(toKey, TO, newLoc, server.locations.get(newLoc)!)).toMatchObject({ label: "Work" });

    const one = plan.apartments.find((a) => a.data.name === "One")!;
    const stored = server.apartments.get(one.id)!;
    expect(stored.version).toBe(2);
    const opened = (await openApartment(toKey, TO, one.id, stored.envelope))!;
    expect(opened).toMatchObject({ shortCode: "2R1B", latitude: 47.5 });
    expect(opened.distances).toEqual({ [newLoc]: { bikeMin: 9, transitMin: 14 } });
    // The PDF opens under the new key and the new row's AAD.
    expect(await downloadPdf(toKey, TO, one.id, opened.pdf!)).toEqual(PDF_BYTES);
    // ...and not under the old key.
    await expect(downloadPdf(fromKey, TO, one.id, opened.pdf!)).rejects.toThrow();

    const two = plan.apartments.find((a) => a.data.name === "Two")!;
    expect(await openRating(toKey, TO, one.id, "u-me", server.ratings.get(`${one.id}:u-me`)!)).toMatchObject({
      kitchen: 5,
      overallFeeling: 4,
    });
    expect(await openRating(toKey, TO, two.id, "u-me", server.ratings.get(`${two.id}:u-me`)!)).toEqual({
      ...EMPTY_RATING,
      comment: 'Rated by Lena: 3/5 "ok"',
    });
  });

  it("keeps going past a refused apartment, which takes its PDF and rating with it", async () => {
    server.refuse.add("One");
    const plan = await exportAndPlan();
    const report = await runImport(plan, { dataKey: toKey, householdId: TO, keyVersion: 1, userId: "u-me" });
    expect(report).toMatchObject({ locations: 1, apartments: 1, pdfs: 0, ratings: 1 });
    expect(report.failed).toEqual([{ kind: "apartment", name: "One", reason: "No apartment credits left" }]);
    expect(server.files.size).toBe(1); // only the source household's file
  });

  it("keeps the apartment when its PDF cannot be uploaded", async () => {
    const plan = await exportAndPlan();
    const realFetch = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) =>
      u === "/api/files" ? json({ error: "Upload failed" }, 500) : realFetch(u, i)
    ));
    const report = await runImport(plan, { dataKey: toKey, householdId: TO, keyVersion: 1, userId: "u-me" });
    expect(report.apartments).toBe(2);
    expect(report.failed).toEqual([{ kind: "pdf", name: "One", reason: "Upload failed" }]);
  });

  it("reports a location and a rating the server refuses", async () => {
    const plan = await exportAndPlan();
    const realFetch = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) =>
      u === "/api/locations" || u.endsWith("/ratings/me") ? json({ error: "Nope" }, 500) : realFetch(u, i)
    ));
    const report = await runImport(plan, { dataKey: toKey, householdId: TO, keyVersion: 1, userId: "u-me" });
    expect(report.failed.map((f) => f.kind).sort()).toEqual(["location", "rating", "rating"]);
  });

  it("moves a household between encryption modes: off to on", async () => {
    // An off-mode household stores plaintext: no key, no iv.
    server.files.set(`/api/uploads/households/${FROM}/${A1}.pdf.enc`, PDF_BYTES.slice());
    snapshot.apartments[0].data!.pdf = { path: `/api/uploads/households/${FROM}/${A1}.pdf.enc`, iv: null };
    const { blob } = await buildExportZip(snapshot, { dataKey: null, householdId: FROM, keyVersion: 1 });
    const plan = planImport(await readExportFile(blob), "u-me", () => crypto.randomUUID(), line);
    const report = await runImport(plan, { dataKey: toKey, householdId: TO, keyVersion: 1, userId: "u-me" });
    expect(report.failed).toEqual([]);
    const one = plan.apartments.find((a) => a.data.name === "One")!;
    const opened = (await openApartment(toKey, TO, one.id, server.apartments.get(one.id)!.envelope))!;
    expect(opened.pdf!.iv).not.toBeNull();
    expect(await downloadPdf(toKey, TO, one.id, opened.pdf!)).toEqual(PDF_BYTES);
  });
});
