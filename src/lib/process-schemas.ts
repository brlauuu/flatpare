import { z } from "zod";

export const geocodeRequestSchema = z.object({
  address: z.string().trim().min(1).max(500),
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
    rentChf: null,
    listingUrl: null,
    summary: null,
    availableFrom: null,
  };
}
