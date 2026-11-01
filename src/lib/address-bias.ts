// #480: where address suggestions are favoured — the middle of the
// household's own geocoded places, rounded to a tenth of a degree (about
// 10 km), so the search sends Google a rough area and never an exact point.
// Null when nothing is placed yet; the search then has no bias.
export function searchBias(
  points: ReadonlyArray<{ latitude: number | null; longitude: number | null }>
): { lat: number; lng: number } | null {
  const placed = points.filter(
    (p): p is { latitude: number; longitude: number } =>
      Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  );
  if (placed.length === 0) return null;
  const round = (v: number) => Math.round(v * 10) / 10;
  const mean = (pick: (p: { latitude: number; longitude: number }) => number) =>
    placed.reduce((sum, p) => sum + pick(p), 0) / placed.length;
  return { lat: round(mean((p) => p.latitude)), lng: round(mean((p) => p.longitude)) };
}
