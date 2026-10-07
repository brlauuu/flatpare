// Which MapLibre `error` events mean the map cannot be drawn at all (#330).
// MapLibre also reports every failed tile through `error`; one slow or
// failed tile on a flaky connection must not replace a map that would
// otherwise draw with the "couldn't load" screen. Fatal = before the first
// load, and not about a single tile (the style or the tile index failed).
export function isFatalMapError(event: { tile?: unknown; sourceId?: string }, loaded: boolean): boolean {
  if (loaded) return false;
  return !event.tile;
}
