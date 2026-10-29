import type { ApartmentDistance } from "@/lib/household-data/types";
import { ApiClientError, sendJson } from "./api-client";
import type { Locale } from "@/locales/locales";

// Client side of the blind /api/process proxies. These are the only
// requests that carry household plaintext (an address, a listing URL, PDF
// bytes) — see the privacy exception in each route.

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  postcode: string | null;
  reason?: string;
}

// `apartmentId` is sent only when this call is the apartment's first
// processing, which spends its credit (#413). A location of interest, and an
// apartment already processed, are geocoded without it.
export function geocodeAddress(address: string, apartmentId?: string): Promise<GeocodeResult> {
  return sendJson<GeocodeResult>("POST", "/api/process/geocode", apartmentId ? { address, apartmentId } : { address });
}

export function distanceBetween(from: string, to: string): Promise<ApartmentDistance> {
  return sendJson<ApartmentDistance>("POST", "/api/process/distance", { from, to });
}

export async function checkListing(url: string): Promise<boolean | null> {
  const { gone } = await sendJson<{ gone: boolean | null }>("POST", "/api/process/check-listing", { url });
  return gone;
}

// no_credits: the household has no apartment credit left for the apartment's
// first processing (#413). too_large: the PDF is over what the server can be
// sent (#438); refused here before anything is sent, or a 413 on the way.
export type ParsePdfReason = "quota" | "invalid_pdf" | "no_credits" | "too_large" | "unknown";

export class ParsePdfError extends Error {
  reason: ParsePdfReason;
  retryAfterSeconds?: number;
  status: number;
  constructor(message: string, reason: ParsePdfReason, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "ParsePdfError";
    this.reason = reason;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ParsePdfResult {
  extracted: Record<string, unknown>;
  aiAvailable: boolean;
  // The listing link was found by a web search, not read from the PDF (#409).
  listingFound?: boolean;
}

export async function parsePdf(
  bytes: Uint8Array<ArrayBuffer>,
  filename: string,
  locale: Locale,
  // The apartment the PDF belongs to (minted before its row exists). Reading
  // it is that apartment's first processing unless it was charged before
  // (#413).
  apartmentId: string,
  // False when the person brought their own link: no search is paid for.
  searchListing = true,
  // The largest PDF the deployment can be sent (Limits.pdfReadMaxBytes);
  // a larger one is refused before the request, so nothing is charged.
  maxBytes?: number
): Promise<ParsePdfResult> {
  if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
    throw new ParsePdfError("PDF too large to read", "too_large", 413);
  }
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: "application/pdf" }));
  form.append("locale", locale);
  form.append("apartmentId", apartmentId);
  if (!searchListing) form.append("searchListing", "0");
  const res = await fetch("/api/process/parse-pdf", { method: "POST", body: form });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const message = typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    const reason: ParsePdfReason =
      body.reason === "quota" || body.reason === "invalid_pdf"
        ? body.reason
        : res.status === 402
          ? "no_credits"
          : res.status === 413
            ? "too_large"
            : res.status === 400
              ? "invalid_pdf"
              : "unknown";
    throw new ParsePdfError(
      message,
      reason,
      res.status,
      typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined
    );
  }
  return body as unknown as ParsePdfResult;
}

// Re-exported so the provider can type-narrow without importing api-client.
export { ApiClientError };
