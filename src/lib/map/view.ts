
// Where the map starts, and where a card opens (#330). Pure, so the phone
// edge cases are pinned without a map or a browser.

export const SWITZERLAND = { center: [8.2275, 46.8182] as [number, number], zoom: 7 };
export const MAX_FIT_ZOOM = 15;

export type InitialView =
  | { kind: "center"; center: [number, number]; zoom: number }
  | {
      kind: "bounds";
      bounds: [[number, number], [number, number]];
      padding: { top: number; right: number; bottom: number; left: number };
      maxZoom: number;
    };

export function initialView(points: { latitude: number; longitude: number }[], viewportWidth: number): InitialView {
  if (points.length === 0) return { kind: "center", center: SWITZERLAND.center, zoom: SWITZERLAND.zoom };
  if (points.length === 1) {
    return { kind: "center", center: [points[0].longitude, points[0].latitude], zoom: MAX_FIT_ZOOM };
  }
  const lngs = points.map((p) => p.longitude);
  const lats = points.map((p) => p.latitude);
  const phone = viewportWidth < 640;
  return {
    kind: "bounds",
    bounds: [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    // Handwritten labels sit to the right of a mark, so the right side needs
    // the most room (the preview cut a label off at a phone's edge).
    padding: phone ? { top: 48, right: 96, bottom: 40, left: 40 } : { top: 64, right: 140, bottom: 56, left: 64 },
    maxZoom: MAX_FIT_ZOOM,
  };
}

export const CARD_WIDTH = 208;
// Half the mark's height plus a small gap.
const CARD_GAP = 30;
const EDGE = 8;

export function cardPosition(
  anchor: { x: number; y: number },
  container: { width: number; height: number },
  cardHeight: number
): { left: number; top: number; placement: "above" | "below" } {
  const maxLeft = Math.max(EDGE, container.width - CARD_WIDTH - EDGE);
  const left = Math.min(Math.max(anchor.x - CARD_WIDTH / 2, EDGE), maxLeft);
  // "above" fits when the estimated height clears the top edge. Its `top`
  // is where the card's bottom edge goes: the caller shifts the card up by
  // its own height (translateY(-100%)), so a card that wraps taller than the
  // estimate grows upward and never covers its mark.
  if (anchor.y - CARD_GAP - cardHeight >= EDGE) return { left, top: anchor.y - CARD_GAP, placement: "above" };
  return { left, top: anchor.y + CARD_GAP, placement: "below" };
}
