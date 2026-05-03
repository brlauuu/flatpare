import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";

interface DistanceResult {
  bikeMinutes: number | null;
  transitMinutes: number | null;
}

export async function calculateDistance(
  originAddress: string,
  destinationAddress: string
): Promise<DistanceResult> {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return calculateWithGoogleMaps(originAddress, destinationAddress);
  }

  if (process.env.OPENROUTESERVICE_API_KEY) {
    return calculateWithOpenRouteService(originAddress, destinationAddress);
  }

  return { bikeMinutes: null, transitMinutes: null };
}

async function calculateWithGoogleMaps(
  originAddress: string,
  destinationAddress: string
): Promise<DistanceResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;
  const results: DistanceResult = { bikeMinutes: null, transitMinutes: null };

  try {
    const [bikeRes, transitRes] = await Promise.all([
      fetchGoogleDistance(originAddress, destinationAddress, "bicycling", apiKey),
      fetchGoogleDistance(originAddress, destinationAddress, "transit", apiKey),
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
  origin: string,
  destination: string,
  mode: string,
  apiKey: string
): Promise<number | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json"
  );
  url.searchParams.set("origins", origin);
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
  originAddress: string,
  destinationAddress: string
): Promise<DistanceResult> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY!;
  const results: DistanceResult = { bikeMinutes: null, transitMinutes: null };

  try {
    const originCoords = await geocodeWithORS(originAddress, apiKey);
    if (!originCoords) return results;

    const destCoords = await geocodeWithORS(destinationAddress, apiKey);
    if (!destCoords) return results;

    const bikeRes = await fetchORSRoute(
      originCoords,
      destCoords,
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
