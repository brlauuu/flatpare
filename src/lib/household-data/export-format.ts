import { z } from "zod";
import { deriveApartments } from "./derive";
import { apartmentSchema, locationSchema, ratingSchema } from "./schemas";
import type {
  Apartment,
  DecodedApartment,
  DecodedLocation,
  DecodedRating,
  Location,
  Rating,
} from "./types";

// The household export (#191): a plaintext ZIP a household keeps as its own
// backup, since under E2EE the host cannot restore anything. This module is
// pure — it turns decoded rows into a map of file names to bytes and back,
// and plans an import — so the ZIP itself, the PDFs and every request live in
// src/components/household-data/export-import.ts.

export const EXPORT_FORMAT = "flatpare-export";
export const EXPORT_VERSION = 1;

export type ExportFiles = Record<string, Uint8Array>;

export interface ExportCounts {
  apartments: number;
  ratings: number;
  locations: number;
  pdfs: number;
}

export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  appVersion: string | null;
  counts: ExportCounts;
  // Rows that could not be decrypted, and PDFs that could not be fetched or
  // opened: left out of the file, counted here so the reader knows.
  skipped: ExportCounts;
}

export interface ExportInput {
  apartments: DecodedApartment[];
  ratings: DecodedRating[];
  locations: DecodedLocation[];
  // Decrypted PDF bytes by apartment id.
  pdfs: Map<string, Uint8Array>;
  // Apartments whose PDF could not be read, by id.
  missingPdfs: number;
  exportedAt: Date;
  appVersion: string | null;
}

export function pdfFileName(apartmentId: string): string {
  return `pdfs/${apartmentId}.pdf`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

// A cell starting with one of these is a formula to a spreadsheet, and
// listing text is not ours: quote it as text.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  if (typeof value !== "string") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS = [
  "id", "name", "address", "rent", "rentCurrency", "sizeM2", "numRooms", "numBathrooms", "numBalconies",
  "hasWashingMachine", "availableFrom", "listingUrl", "shortCode", "listingGone",
  "ratings", "avgOverall", "avgKitchen", "avgBalconies", "avgLocation", "avgFloorplan", "createdAt",
] as const;

function apartmentsCsv(apartments: DecodedApartment[], ratings: DecodedRating[]): string {
  const rows = deriveApartments(apartments, ratings, "").map((a) =>
    [
      a.id, a.name, a.address, a.rentChf, a.rentCurrency, a.sizeM2, a.numRooms, a.numBathrooms, a.numBalconies,
      a.hasWashingMachine, a.availableFrom, a.listingUrl, a.shortCode, a.listingGone,
      a.ratings.length, a.avgOverall, a.avgKitchen, a.avgBalconies, a.avgLocation, a.avgFloorplan, a.createdAt,
    ].map(csvCell).join(",")
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function buildExportFiles(input: ExportInput): ExportFiles {
  const apartments = input.apartments.filter((a) => a.data !== null);
  const kept = new Set(apartments.map((a) => a.id));
  const ratings = input.ratings.filter((r) => r.data !== null && kept.has(r.apartmentId));
  const locations = input.locations.filter((l) => l.data !== null);

  const files: ExportFiles = {};
  let pdfs = 0;
  for (const a of apartments) {
    const bytes = input.pdfs.get(a.id);
    if (bytes) {
      files[pdfFileName(a.id)] = bytes;
      pdfs++;
    }
  }

  const manifest: ExportManifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    appVersion: input.appVersion,
    counts: { apartments: apartments.length, ratings: ratings.length, locations: locations.length, pdfs },
    skipped: {
      apartments: input.apartments.length - apartments.length,
      ratings: input.ratings.filter((r) => r.data === null).length,
      locations: input.locations.length - locations.length,
      pdfs: input.missingPdfs,
    },
  };

  files["manifest.json"] = json(manifest);
  files["apartments.json"] = json(
    apartments.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      data: { ...a.data, pdf: input.pdfs.has(a.id) ? pdfFileName(a.id) : null },
    }))
  );
  files["ratings.json"] = json(
    ratings.map((r) => ({
      apartmentId: r.apartmentId,
      userId: r.userId,
      userName: r.userName,
      updatedAt: r.updatedAt,
      data: r.data,
    }))
  );
  files["locations.json"] = json(
    locations.map((l) => ({ id: l.id, sortOrder: l.sortOrder, data: l.data }))
  );
  files["apartments.csv"] = encoder.encode(apartmentsCsv(apartments, ratings));
  return files;
}

// ---- reading ---------------------------------------------------------------

export type ExportFormatProblem = "not-export" | "newer-version" | "invalid";

export class ExportFormatError extends Error {
  constructor(readonly problem: ExportFormatProblem, detail?: string) {
    super(detail ? `${problem}: ${detail}` : problem);
    this.name = "ExportFormatError";
  }
}

export interface ParsedApartment {
  id: string;
  data: Apartment;
  pdf: Uint8Array | null;
}

export interface ParsedRating {
  apartmentId: string;
  userId: string;
  userName: string;
  data: Rating;
}

export interface ParsedLocation {
  id: string;
  sortOrder: number;
  data: Location;
}

export interface ParsedExport {
  manifest: ExportManifest;
  apartments: ParsedApartment[];
  ratings: ParsedRating[];
  locations: ParsedLocation[];
}

const countsSchema = z.object({
  apartments: z.number(),
  ratings: z.number(),
  locations: z.number(),
  pdfs: z.number(),
});

const manifestSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  appVersion: z.string().nullable(),
  counts: countsSchema,
  skipped: countsSchema,
});

const apartmentEntrySchema = z.object({
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
const ratingEntrySchema = z.object({
  apartmentId: z.string().min(1),
  userId: z.string(),
  userName: z.string(),
  data: ratingSchema,
});
const locationEntrySchema = z.object({
  id: z.string().min(1),
  sortOrder: z.number(),
  data: locationSchema,
});

function readJson(files: ExportFiles, name: string): unknown {
  const bytes = files[name];
  if (!bytes) throw new ExportFormatError("invalid", `${name} is missing`);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new ExportFormatError("invalid", `${name} is not JSON`);
  }
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ExportFormatError("invalid", name);
  return parsed.data;
}

export function parseExportFiles(files: ExportFiles): ParsedExport {
  if (!files["manifest.json"]) throw new ExportFormatError("not-export");
  const rawManifest = readJson(files, "manifest.json");
  const format = (rawManifest as { format?: unknown } | null)?.format;
  if (format !== EXPORT_FORMAT) throw new ExportFormatError("not-export");
  const manifest = parseWith(manifestSchema, rawManifest, "manifest.json");
  if (manifest.version > EXPORT_VERSION) throw new ExportFormatError("newer-version");

  const apartments = parseWith(z.array(apartmentEntrySchema), readJson(files, "apartments.json"), "apartments.json").map(
    (entry) => {
      const pdfName = entry.data.pdf;
      if (pdfName !== null && typeof pdfName !== "string") {
        throw new ExportFormatError("invalid", "apartments.json");
      }
      const data = parseWith(apartmentSchema, { ...entry.data, pdf: null }, "apartments.json");
      return { id: entry.id, data, pdf: pdfName ? files[pdfName] ?? null : null };
    }
  );
  const ratings = parseWith(z.array(ratingEntrySchema), readJson(files, "ratings.json"), "ratings.json");
  const locations = parseWith(z.array(locationEntrySchema), readJson(files, "locations.json"), "locations.json");
  return { manifest, apartments, ratings, locations };
}

// ---- planning an import ----------------------------------------------------

export interface PlannedApartment {
  id: string;
  data: Apartment;
  pdf: Uint8Array | null;
}

export interface PlannedRating {
  apartmentId: string;
  data: Rating;
}

export interface ImportPlan {
  // In their original order; the server appends each one, so the order holds.
  locations: { id: string; data: Location }[];
  apartments: PlannedApartment[];
  // The importer's own rating per apartment, the only rating they can write.
  ratings: PlannedRating[];
}

// Puts someone else's rating into words for the importer's comment. Taken
// from the caller so the line is in the importer's language.
export type RatingLine = (rating: { userName: string; data: Rating }) => string;

const NOT_RATED: Omit<Rating, "comment"> = {
  kitchen: 0,
  balconies: 0,
  location: 0,
  floorplan: 0,
  overallFeeling: 0,
};

export function planImport(
  parsed: ParsedExport,
  importerUserId: string,
  newId: () => string,
  ratingLine: RatingLine
): ImportPlan {
  const locations = [...parsed.locations]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({ sourceId: l.id, id: newId(), data: l.data }));
  const locationIds = new Map(locations.map((l) => [l.sourceId, l.id]));

  const apartmentIds = new Map<string, string>();
  const apartments = parsed.apartments.map((a) => {
    const id = newId();
    apartmentIds.set(a.id, id);
    const distances = Object.fromEntries(
      Object.entries(a.data.distances).flatMap(([locId, d]) => {
        const mapped = locationIds.get(locId);
        return mapped ? [[mapped, d]] : [];
      })
    );
    // Who added it does not carry across (#430): user ids are per instance.
    return { id, data: { ...a.data, distances, pdf: null, addedBy: null }, pdf: a.pdf };
  });

  const ratings: PlannedRating[] = [];
  for (const [sourceId, id] of apartmentIds) {
    const forApartment = parsed.ratings.filter((r) => r.apartmentId === sourceId);
    if (forApartment.length === 0) continue;
    const own = forApartment.find((r) => r.userId === importerUserId);
    const lines = forApartment.filter((r) => r !== own).map((r) => ratingLine(r));
    const comment = [own?.data.comment ?? "", ...lines].filter((s) => s !== "").join("\n\n");
    ratings.push({
      apartmentId: id,
      data: own ? { ...own.data, comment } : { ...NOT_RATED, comment },
    });
  }

  return { locations: locations.map(({ id, data }) => ({ id, data })), apartments, ratings };
}
