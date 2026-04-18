import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";

const BASEL_SBB = "Basel SBB, Switzerland";
const BASEL_SBB_COORDS = { lat: 47.5476, lng: 7.5897 };

interface DistanceResult {
  bikeMinutes: number | null;
  transitMinutes: number | null;
}

export async function calculateDistance(
  address: string
): Promise<DistanceResult> {
  // Try Google Maps first
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return calculateWithGoogleMaps(address);
  }

  // Fall back to OpenRouteService
  if (process.env.OPENROUTESERVICE_API_KEY) {
    return calculateWithOpenRouteService(address);
  }

  // No provider — return nulls for manual entry
  return { bikeMinutes: null, transitMinutes: null };
}

async function calculateWithGoogleMaps(
  address: string
): Promise<DistanceResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;
  const results: DistanceResult = { bikeMinutes: null, transitMinutes: null };

  try {
    const [bikeRes, transitRes] = await Promise.all([
      fetchGoogleDistance(address, "bicycling", apiKey),
      fetchGoogleDistance(address, "transit", apiKey),
    ]);

    results.bikeMinutes = bikeRes;
    results.transitMinutes = transitRes;

    try {
      await db.insert(apiUsage).values({
        service: "google_maps",
        operation: "calculate_distance",
      });
    } catch {
      // Don't fail distance calc if logging fails
    }
  } catch {
    // Return nulls on failure
  }

  return results;
}

async function fetchGoogleDistance(
  destination: string,
  mode: string,
  apiKey: string
): Promise<number | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json"
  );
  url.searchParams.set("origins", BASEL_SBB);
  url.searchParams.set("destinations", destination);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  const data = await res.json();

  const element = data.rows?.[0]?.elements?.[0];
  if (element?.status !== "OK") return null;

  return Math.round(element.duration.value / 60);
}

async function calculateWithOpenRouteService(
  address: string
): Promise<DistanceResult> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY!;
  const results: DistanceResult = { bikeMinutes: null, transitMinutes: null };

  try {
    // First geocode the address
    const coords = await geocodeWithORS(address, apiKey);
    if (!coords) return results;

    // ORS supports cycling-regular; no public transit support
    const bikeRes = await fetchORSRoute(
      BASEL_SBB_COORDS,
      coords,
      "cycling-regular",
      apiKey
    );
    results.bikeMinutes = bikeRes;
    // ORS doesn't support public transit — leave transitMinutes as null

    try {
      await db.insert(apiUsage).values({
        service: "openrouteservice",
        operation: "calculate_distance",
      });
    } catch {
      // Don't fail if logging fails
    }
  } catch {
    // Return nulls on failure
  }

  return results;
}

async function geocodeWithORS(
  address: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", address);
  url.searchParams.set("size", "1");

  const res = await fetch(url.toString());
  const data = await res.json();

  const coords = data.features?.[0]?.geometry?.coordinates;
  if (!coords) return null;

  return { lng: coords[0], lat: coords[1] };
}

async function fetchORSRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  profile: string,
  apiKey: string
): Promise<number | null> {
  const url = `https://api.openrouteservice.org/v2/directions/${profile}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
    }),
  });

  const data = await res.json();
  const duration = data.routes?.[0]?.summary?.duration;
  if (duration == null) return null;

  return Math.round(duration / 60);
}
