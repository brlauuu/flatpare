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
