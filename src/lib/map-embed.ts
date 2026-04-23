// Returns a Google Maps Embed API URL for the given address,
// or null when either the address or GOOGLE_MAPS_API_KEY is missing.
// Requires the "Maps Embed API" enabled in Google Cloud Console.
export function buildMapEmbedUrl(address: string | null | undefined): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  if (!address || !address.trim()) return null;
  const base = "https://www.google.com/maps/embed/v1/place";
  const params = new URLSearchParams({
    key,
    q: address.trim(),
  });
  return `${base}?${params.toString()}`;
}
