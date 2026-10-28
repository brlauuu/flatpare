// The apartment page has no map of its own (#384): "Show on map" opens the
// household map with the apartment highlighted among the others. Nothing to
// show for an apartment without coordinates. The button itself sits with the
// page's other actions (#407).
export function showOnMapHref(apartment: { id: string; latitude: number | null; longitude: number | null }): string | null {
  if (apartment.latitude === null || apartment.longitude === null) return null;
  return `/map?highlight=${encodeURIComponent(apartment.id)}`;
}
