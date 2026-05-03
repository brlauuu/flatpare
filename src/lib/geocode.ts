import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";

// Common postcode shapes, cheapest-first.
// CH/US/DE: 4–5 digits surrounded by non-digits (or string edges).
// UK: alphanumeric like "SW1A 1AA" or "EC1A1BB".
const PATTERNS: RegExp[] = [
  /(?<![A-Z0-9])([0-9]{4,5})(?![0-9])/,
  /(?<![A-Z0-9])([A-Z]{1,2}[0-9][A-Z0-9]?)\s?([0-9][A-Z]{2})(?![A-Z0-9])/i,
];

function normalizePostcode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function tryRegex(address: string): string | null {
  for (const re of PATTERNS) {
    const m = address.match(re);
    if (!m) continue;
    if (m.length > 2 && m[1] && m[2]) {
      return normalizePostcode(m[1] + m[2]);
    }
    return normalizePostcode(m[1]);
  }
  return null;
}

async function logUsage(service: string) {
  try {
    await db.insert(apiUsage).values({ service, operation: "geocode" });
  } catch {
    // Don't fail the geocode if usage logging fails.
  }
}

async function tryGoogleGeocode(address: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    await logUsage("google_maps");
    const components = data.results?.[0]?.address_components ?? [];
    const hit = components.find((c: { types?: string[] }) =>
      c.types?.includes("postal_code")
    );
    return hit?.long_name ? normalizePostcode(String(hit.long_name)) : null;
  } catch {
    return null;
  }
}

async function tryOrsGeocode(address: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL("https://api.openrouteservice.org/geocode/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("text", address);
    url.searchParams.set("size", "1");
    const res = await fetch(url.toString());
    const data = await res.json();
    await logUsage("openrouteservice");
    const raw = data.features?.[0]?.properties?.postalcode;
    return raw ? normalizePostcode(String(raw)) : null;
  } catch {
    return null;
  }
}

interface LatLng {
  lat: number;
  lng: number;
}

async function tryGoogleGeocodeLatLng(
  address: string
): Promise<{ result: LatLng | null; reason?: string }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { result: null, reason: "no_api_key" };
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    await logUsage("google_maps");
    const loc = data.results?.[0]?.geometry?.location;
    if (
      loc &&
      typeof loc.lat === "number" &&
      typeof loc.lng === "number"
    ) {
      return { result: { lat: loc.lat, lng: loc.lng } };
    }
    const status = typeof data.status === "string" ? data.status : "UNKNOWN";
    const errorMessage =
      typeof data.error_message === "string" ? data.error_message : null;
    const reason = errorMessage ? `${status}: ${errorMessage}` : status;
    console.error(
      `[geocode:google] no result for "${address}" — ${reason}`
    );
    return { result: null, reason };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch_failed";
    console.error(`[geocode:google] fetch failed — ${reason}`);
    return { result: null, reason };
  }
}

async function tryOrsGeocodeLatLng(
  address: string
): Promise<{ result: LatLng | null; reason?: string }> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return { result: null, reason: "no_api_key" };
  try {
    const url = new URL("https://api.openrouteservice.org/geocode/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("text", address);
    url.searchParams.set("size", "1");
    const res = await fetch(url.toString());
    const data = await res.json();
    await logUsage("openrouteservice");
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      return { result: { lat: coords[1], lng: coords[0] } };
    }
    return { result: null, reason: "ors_no_results" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch_failed";
    console.error(`[geocode:ors] fetch failed — ${reason}`);
    return { result: null, reason };
  }
}

interface GeocodeAttempt {
  result: LatLng | null;
  googleReason?: string;
  orsReason?: string;
}

export async function geocodeLatLngWithReason(
  address: string | null | undefined
): Promise<GeocodeAttempt> {
  if (!address || !address.trim()) {
    return { result: null, googleReason: "empty_address" };
  }
  const google = await tryGoogleGeocodeLatLng(address);
  if (google.result) return { result: google.result };
  const ors = await tryOrsGeocodeLatLng(address);
  return {
    result: ors.result,
    googleReason: google.reason,
    orsReason: ors.reason,
  };
}

export async function geocodeLatLng(
  address: string | null | undefined
): Promise<LatLng | null> {
  return (await geocodeLatLngWithReason(address)).result;
}

export async function extractPostcode(
  address: string
): Promise<string | null> {
  if (!address.trim()) return null;

  const regexHit = tryRegex(address);
  if (regexHit) return regexHit;

  const googleHit = await tryGoogleGeocode(address);
  if (googleHit) return googleHit;

  const orsHit = await tryOrsGeocode(address);
  if (orsHit) return orsHit;

  return null;
}
