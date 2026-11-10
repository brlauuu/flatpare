import { z } from "zod";
import { LOCALES } from "@/locales/locales";
import { emptyFeatures } from "@/lib/household-data/features";

// `apartmentId` names the apartment being processed, which is what the
// first-processing charge keys on (#413). A location of interest is
// geocoded without one, and that is free.
export const geocodeRequestSchema = z.object({
  address: z.string().trim().min(1).max(500),
  apartmentId: z.uuid().optional(),
});

// #480: a partly typed address, for a location of interest's suggestions,
// and the suggestion picked. Free: neither names an apartment. The session
// token is the browser's, shared by one search's calls; `near` is the
// rounded middle of the household's own places, to favour suggestions there.
const sessionFields = {
  sessionToken: z.uuid(),
  language: z.enum(LOCALES),
};

export const addressSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  ...sessionFields,
  near: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().default(null),
});

// A Places id is URL-safe text; anything else could change the request path.
export const addressPlaceRequestSchema = z.object({
  placeId: z.string().regex(/^[A-Za-z0-9_-]{1,300}$/),
  ...sessionFields,
});

export const distanceRequestSchema = z.object({
  from: z.string().trim().min(1).max(500),
  to: z.string().trim().min(1).max(500),
});

// Only web URLs are probed: a listing link is always http(s), and the
// server must never be talked into fetching file:, ftp: or anything local.
export const checkListingRequestSchema = z.object({
  url: z
    .string()
    .max(2000)
    .refine((value) => {
      try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "must be an http(s) URL"),
});

// Gemini's inline-file limit is 20 MB; the env override exists for
// self-hosters pointing at another provider. Read per call, not at module
// load, so tests can stub it.
export function parsePdfMaxBytes(): number {
  const raw = Number(process.env.PARSE_PDF_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 20 * 1024 * 1024;
}

export function emptyExtraction(filename: string) {
  return {
    name: filename.replace(/\.pdf$/i, ""),
    address: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    hasWashingMachine: null,
    ...emptyFeatures(),
    rentChf: null,
    rentCurrency: null,
    listingUrl: null,
    summary: null,
    availableFrom: null,
  };
}
