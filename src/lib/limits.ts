import { readOptionalPositiveInt } from "@/lib/env-int";
import { parsePdfMaxBytes } from "@/lib/process-schemas";

// Vercel refuses a function request body over 4.5 MB before the route runs
// (#438), and a PDF is read by posting it to /api/process/parse-pdf. The
// margin covers the multipart wrapping around the file.
export const VERCEL_PDF_READ_MAX_BYTES = 4_500_000 - 16_384;

// E5 entitlements. Both null means unlimited, which is the self-hoster's
// default and must not regress.
//
// There is deliberately NO tier dimension here, and `households.tier` is not
// read: the hosted deployment has no free tier — everyone using it pays from
// day one — and a self-hoster sets whatever they like. The spec's older line
// about "5 and 20, lifted to 10 and 100 for a paid account" describes a model
// that was not adopted; see docs/superpowers/plans/2026-09-08-e5-tier-limits.md.
//
// Counting rows needs no decryption, so these caps work fine against opaque
// envelopes — nothing here opens one.
export interface Limits {
  maxMembers: number | null;
  maxApartments: number | null;
  // Not an entitlement: the largest PDF this deployment can be sent to read
  // (#438), checked in the browser before anything is sent or charged. It
  // travels with the limits because they take the same path. Absent in test
  // fixtures, which means no check in the browser.
  pdfReadMaxBytes?: number;
}

export function readLimits(): Limits {
  return {
    maxMembers: readOptionalPositiveInt("MAX_MEMBERS"),
    maxApartments: readOptionalPositiveInt("MAX_APARTMENTS"),
    pdfReadMaxBytes: process.env.VERCEL
      ? Math.min(VERCEL_PDF_READ_MAX_BYTES, parsePdfMaxBytes())
      : parsePdfMaxBytes(),
  };
}
