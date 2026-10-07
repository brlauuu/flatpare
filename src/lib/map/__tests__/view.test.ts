import { describe, it, expect } from "vitest";
import { CARD_WIDTH, MAX_FIT_ZOOM, SWITZERLAND, cardPosition, initialView } from "../view";

describe("initialView", () => {
  it("shows Switzerland when nothing has coordinates", () => {
    expect(initialView([], 1280)).toEqual({ kind: "center", center: SWITZERLAND.center, zoom: SWITZERLAND.zoom });
  });

  it("centres a single point at the zoom cap", () => {
    expect(initialView([{ latitude: 47.5, longitude: 7.6 }], 1280)).toEqual({ kind: "center", center: [7.6, 47.5], zoom: MAX_FIT_ZOOM });
  });

  it("fits several points, south-west to north-east, capped at zoom 15", () => {
    const v = initialView([{ latitude: 47.5, longitude: 7.6 }, { latitude: 47.6, longitude: 7.5 }], 1280);
    expect(v.kind).toBe("bounds");
    if (v.kind !== "bounds") return;
    expect(v.bounds).toEqual([[7.5, 47.5], [7.6, 47.6]]);
    expect(v.maxZoom).toBe(15);
  });

  it("leaves room on the right for the handwritten labels, also on a phone", () => {
    const phone = initialView([{ latitude: 47.5, longitude: 7.6 }, { latitude: 47.6, longitude: 7.5 }], 390);
    if (phone.kind !== "bounds") throw new Error("expected bounds");
    expect(phone.padding.right).toBeGreaterThan(phone.padding.left);
    expect(phone.padding.right).toBeGreaterThanOrEqual(90);
  });
});

describe("cardPosition", () => {
  const box = { width: 390, height: 700 };

  it("opens above the mark when there is room", () => {
    expect(cardPosition({ x: 200, y: 400 }, box, 150)).toEqual({ left: 200 - CARD_WIDTH / 2, top: 400 - 30 - 150, placement: "above" });
  });

  it("opens below a mark near the top edge", () => {
    const p = cardPosition({ x: 200, y: 60 }, box, 150);
    expect(p.placement).toBe("below");
    expect(p.top).toBe(60 + 30);
  });

  it("stays inside the map on the left and right edges of a phone", () => {
    expect(cardPosition({ x: 5, y: 400 }, box, 150).left).toBe(8);
    expect(cardPosition({ x: 385, y: 400 }, box, 150).left).toBe(390 - CARD_WIDTH - 8);
  });
});
