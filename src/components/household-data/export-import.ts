import { unzipSync, zipSync, type Zippable } from "fflate";
import { sealApartment, sealLocation, sealRating } from "@/lib/household-data/codec";
import { mapConcurrent } from "@/lib/household-data/concurrency";
import {
  buildExportFiles,
  ExportFormatError,
  parseExportFiles,
  type ExportFiles,
  type ImportPlan,
  type ParsedExport,
} from "@/lib/household-data/export-format";
import type { DecodedApartment, DecodedLocation, DecodedRating } from "@/lib/household-data/types";
import type { ApartmentRow } from "@/lib/household-data/wire";
import { sendJson } from "./api-client";
import { downloadPdf, encryptAndUploadPdf } from "./pdf-files";

// Export and import (#191). Design: docs/superpowers/specs/2026-10-24-export-import-design.md.
// Everything happens in the browser: the export decrypts what the store
// already holds plus each PDF, the import seals and posts through the
// ordinary routes. The import calls no outside service — coordinates,
// short codes and distances travel in the file.

export interface HouseholdKeyContext {
  dataKey: CryptoKey | null;
  householdId: number;
  keyVersion: number;
}

export interface HouseholdSnapshot {
  apartments: DecodedApartment[];
  ratings: DecodedRating[];
  locations: DecodedLocation[];
}

const PDF_CONCURRENCY = 3;

export async function buildExportZip(
  snapshot: HouseholdSnapshot,
  ctx: HouseholdKeyContext,
  now: Date = new Date()
): Promise<{ blob: Blob; missingPdfs: number }> {
  const withPdf = snapshot.apartments.filter((a) => a.data?.pdf);
  const pdfs = new Map<string, Uint8Array>();
  let missingPdfs = 0;
  await mapConcurrent(withPdf, PDF_CONCURRENCY, async (a) => {
    try {
      pdfs.set(a.id, await downloadPdf(ctx.dataKey, ctx.householdId, a.id, a.data!.pdf!));
    } catch {
      missingPdfs++;
    }
  });
  const files = buildExportFiles({
    ...snapshot,
    pdfs,
    missingPdfs,
    exportedAt: now,
    // Inlined at build time by next.config.ts from CHANGELOG.md, the same
    // value the landing page's release notice reads; not configuration.
    appVersion: process.env.FLATPARE_RELEASE_VERSION || null,
  });
  // PDFs are already compressed; deflating them again costs time for nothing.
  const zippable: Zippable = {};
  for (const [name, bytes] of Object.entries(files)) {
    zippable[name] = [bytes, { level: name.endsWith(".pdf") ? 0 : 6 }];
  }
  const zipped = zipSync(zippable);
  return { blob: new Blob([new Uint8Array(zipped)], { type: "application/zip" }), missingPdfs };
}

export function exportFileName(now: Date = new Date()): string {
  return `flatpare-export-${now.toISOString().slice(0, 10)}.zip`;
}

export async function readExportFile(file: Blob): Promise<ParsedExport> {
  let files: ExportFiles;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ExportFormatError("not-export");
  }
  return parseExportFiles(files);
}

export interface ImportFailure {
  kind: "location" | "apartment" | "pdf" | "rating";
  name: string;
  reason: string;
}

export interface ImportReport {
  locations: number;
  apartments: number;
  pdfs: number;
  ratings: number;
  failed: ImportFailure[];
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Writes the plan one row at a time and keeps going past a failure, so one
// bad PDF does not cost the rest of the household. An apartment that could
// not be created takes its PDF and rating with it.
export async function runImport(
  plan: ImportPlan,
  ctx: HouseholdKeyContext & { userId: string },
  onProgress?: (done: number, total: number) => void
): Promise<ImportReport> {
  const { dataKey, householdId, keyVersion, userId } = ctx;
  const report: ImportReport = { locations: 0, apartments: 0, pdfs: 0, ratings: 0, failed: [] };
  const total = plan.locations.length + plan.apartments.length;
  let done = 0;
  const step = () => onProgress?.(++done, total);

  for (const loc of plan.locations) {
    try {
      const envelope = await sealLocation(dataKey, householdId, loc.id, loc.data, keyVersion);
      await sendJson("POST", "/api/locations", { id: loc.id, envelope });
      report.locations++;
    } catch (err) {
      report.failed.push({ kind: "location", name: loc.data.label, reason: reasonOf(err) });
    }
    step();
  }

  const ratingFor = new Map(plan.ratings.map((r) => [r.apartmentId, r.data]));
  for (const apt of plan.apartments) {
    const name = apt.data.name;
    let row: ApartmentRow;
    try {
      const envelope = await sealApartment(dataKey, householdId, apt.id, apt.data, keyVersion);
      row = await sendJson<ApartmentRow>("POST", "/api/apartments", { id: apt.id, envelope });
      report.apartments++;
    } catch (err) {
      report.failed.push({ kind: "apartment", name, reason: reasonOf(err) });
      step();
      continue;
    }

    // Created first and attached after, so a PDF that fails to upload
    // leaves a working apartment rather than an orphaned file.
    if (apt.pdf) {
      try {
        const pdf = await encryptAndUploadPdf(
          dataKey, householdId, apt.id, new Uint8Array(apt.pdf), keyVersion
        );
        const envelope = await sealApartment(dataKey, householdId, apt.id, { ...apt.data, pdf }, keyVersion);
        await sendJson("PUT", `/api/apartments/${apt.id}`, { version: row.version, envelope });
        report.pdfs++;
      } catch (err) {
        report.failed.push({ kind: "pdf", name, reason: reasonOf(err) });
      }
    }

    const rating = ratingFor.get(apt.id);
    if (rating) {
      try {
        const envelope = await sealRating(dataKey, householdId, apt.id, userId, rating, keyVersion);
        await sendJson("PUT", `/api/apartments/${apt.id}/ratings/me`, { envelope });
        report.ratings++;
      } catch (err) {
        report.failed.push({ kind: "rating", name, reason: reasonOf(err) });
      }
    }
    step();
  }
  return report;
}
