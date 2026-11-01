import { scrubbedErrorLine } from "@/lib/log-scrub";
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

async function tryGoogleGeocode(address: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
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
    // E4: the address is the user's plaintext and must not reach a log.
    // `reason` is Google's own status/error_message — provider text about
    // the request's outcome, not an echo of the input. If a provider ever
    // starts echoing input there, this is the line to revisit.
    console.error(`[geocode:google] no result — ${reason}`);
    return { result: null, reason };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch_failed";
    // Logged scrubbed, returned intact: `reason` goes to the client, which
    // already knows its own address, but a fetch error's message is the
    // outbound URL — address and GOOGLE_MAPS_API_KEY in the query string.
    console.error(`[geocode:google] fetch failed — ${scrubbedErrorLine(err)}`);
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
    console.error(`[geocode:ors] fetch failed — ${scrubbedErrorLine(err)}`);
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

export interface AddressMatch {
  address: string;
  lat: number;
  lng: number;
}

export const ADDRESS_SEARCH_LIMIT = 5;

const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

async function searchGoogle(query: string): Promise<AddressMatch[] | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    const results: unknown[] = Array.isArray(data.results) ? data.results : [];
    return results.flatMap((r) => {
      const hit = r as { formatted_address?: unknown; geometry?: { location?: { lat?: unknown; lng?: unknown } } };
      const loc = hit.geometry?.location;
      if (typeof hit.formatted_address !== "string" || !isCoord(loc?.lat) || !isCoord(loc?.lng)) return [];
      return [{ address: hit.formatted_address, lat: loc.lat, lng: loc.lng }];
    });
  } catch (err) {
    // Same posture as tryGoogleGeocodeLatLng: the message is the outbound URL.
    console.error(`[address-search:google] fetch failed — ${scrubbedErrorLine(err)}`);
    return null;
  }
}

async function searchOrs(query: string): Promise<AddressMatch[] | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return null;
  try {
    const url = new URL("https://api.openrouteservice.org/geocode/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("text", query);
    url.searchParams.set("size", String(ADDRESS_SEARCH_LIMIT));
    const res = await fetch(url.toString());
    const data = await res.json();
    const features: unknown[] = Array.isArray(data.features) ? data.features : [];
    return features.flatMap((f) => {
      const hit = f as { properties?: { label?: unknown }; geometry?: { coordinates?: unknown } };
      const coords = hit.geometry?.coordinates;
      const label = hit.properties?.label;
      if (typeof label !== "string" || !Array.isArray(coords) || !isCoord(coords[0]) || !isCoord(coords[1])) return [];
      return [{ address: label, lat: coords[1], lng: coords[0] }];
    });
  } catch (err) {
    console.error(`[address-search:ors] fetch failed — ${scrubbedErrorLine(err)}`);
    return null;
  }
}

// #480: the matches for a partly typed address, for a location of interest.
// Google first, OpenRouteService when Google is not configured, fails, or
// finds nothing; an empty list when neither finds anything or neither is set.
export async function searchAddresses(query: string): Promise<AddressMatch[]> {
  if (!query.trim()) return [];
  const google = await searchGoogle(query);
  if (google && google.length > 0) return google.slice(0, ADDRESS_SEARCH_LIMIT);
  const ors = await searchOrs(query);
  return (ors ?? []).slice(0, ADDRESS_SEARCH_LIMIT);
}
