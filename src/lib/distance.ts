const BASEL_SBB = "Basel SBB, Switzerland";

interface DistanceResult {
  bikeMinutes: number | null;
  transitMinutes: number | null;
}

export async function calculateDistance(
  address: string
): Promise<DistanceResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { bikeMinutes: null, transitMinutes: null };
  }

  const results: DistanceResult = { bikeMinutes: null, transitMinutes: null };

  try {
    const [bikeRes, transitRes] = await Promise.all([
      fetchDistance(address, "bicycling", apiKey),
      fetchDistance(address, "transit", apiKey),
    ]);

    results.bikeMinutes = bikeRes;
    results.transitMinutes = transitRes;
  } catch {
    // Return nulls on failure — user can fill in manually
  }

  return results;
}

async function fetchDistance(
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
