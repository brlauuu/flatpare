import type { ApartmentDistance } from "@/lib/household-data/types";
import { ApiClientError, sendJson } from "./api-client";

// Client side of the blind /api/process proxies. These are the only
// requests that carry household plaintext (an address, a listing URL, PDF
// bytes) — see the privacy exception in each route.

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  postcode: string | null;
  reason?: string;
}

export function geocodeAddress(address: string): Promise<GeocodeResult> {
  return sendJson<GeocodeResult>("POST", "/api/process/geocode", { address });
}

export function distanceBetween(from: string, to: string): Promise<ApartmentDistance> {
  return sendJson<ApartmentDistance>("POST", "/api/process/distance", { from, to });
}

export async function checkListing(url: string): Promise<boolean | null> {
  const { gone } = await sendJson<{ gone: boolean | null }>("POST", "/api/process/check-listing", { url });
  return gone;
}

export type ParsePdfReason = "quota" | "invalid_pdf" | "unknown";

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
}

export async function parsePdf(
  bytes: Uint8Array<ArrayBuffer>,
  filename: string
): Promise<ParsePdfResult> {
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: "application/pdf" }));
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
        : res.status === 413 || res.status === 400
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
