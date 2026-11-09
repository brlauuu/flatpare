import { describe, it, expect } from "vitest";
import {
  APARTMENT_MARKS,
  apartmentMarkPath,
  apartmentMarkShape,
  scribbleCrossPath,
  scribbleDotPath,
  scribbleHatchPath,
  scribbleTrianglePath,
  seedFromId,
} from "../marks";

function coords(d: string): [number, number][] {
  const nums = d.replace(/[MLQ]/g, " ").trim().split(/\s+/).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

describe("scribbled dot (#479)", () => {
  it("draws the same dot for the same apartment every time", () => {
    const id = "6f1c2b9e-0000-4000-8000-000000000001";
    expect(scribbleDotPath(seedFromId(id))).toBe(scribbleDotPath(seedFromId(id)));
  });

  it("draws a different scribble for a different apartment", () => {
    const a = scribbleDotPath(seedFromId("6f1c2b9e-0000-4000-8000-000000000001"));
    const b = scribbleDotPath(seedFromId("6f1c2b9e-0000-4000-8000-000000000002"));
    expect(a).not.toBe(b);
  });

  it("is an open stroke that stays a dot: within 10 of the mark's centre, no circle around it", () => {
    const d = scribbleDotPath(seedFromId("x"));
    expect(d.startsWith("M ")).toBe(true);
    expect(d).not.toContain("Z");
    for (const [x, y] of coords(d)) {
      expect(Math.hypot(x - 32, y - 22)).toBeLessThanOrEqual(10);
    }
  });

  it("winds in towards the middle, so the strokes fill the dot", () => {
    const pts = coords(scribbleDotPath(seedFromId("y")));
    const dist = ([x, y]: [number, number]) => Math.hypot(x - 32, y - 22);
    expect(dist(pts[0])).toBeGreaterThan(5);
    expect(dist(pts[pts.length - 1])).toBeLessThan(3);
  });
});

describe("apartment marks (#479)", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `6f1c2b9e-0000-4000-8000-${String(i).padStart(12, "0")}`);

  it("gives each apartment one of the marks, the same one every time", () => {
    for (const id of ids) {
      expect(APARTMENT_MARKS).toContain(apartmentMarkShape(seedFromId(id)));
      expect(apartmentMarkPath(seedFromId(id))).toBe(apartmentMarkPath(seedFromId(id)));
    }
  });

  it("uses every mark across a household's apartments", () => {
    const used = new Set(ids.map((id) => apartmentMarkShape(seedFromId(id))));
    expect([...used].sort()).toEqual([...APARTMENT_MARKS].sort());
  });

  it("draws the mark it picked", () => {
    const draw = { dot: scribbleDotPath, cross: scribbleCrossPath, hatch: scribbleHatchPath, triangle: scribbleTrianglePath };
    for (const id of ids.slice(0, 8)) {
      const seed = seedFromId(id);
      expect(apartmentMarkPath(seed)).toBe(draw[apartmentMarkShape(seed)](seed));
    }
  });

  it.each([
    ["cross", scribbleCrossPath],
    ["hatch", scribbleHatchPath],
    ["triangle", scribbleTrianglePath],
  ])("draws the %s as an open pen stroke the size of the dot", (_, draw) => {
    for (const id of ids.slice(0, 10)) {
      const d = draw(seedFromId(id));
      expect(d.startsWith("M ")).toBe(true);
      expect(d).not.toContain("Z");
      for (const [x, y] of coords(d)) expect(Math.hypot(x - 32, y - 22)).toBeLessThanOrEqual(11);
    }
  });

  it("draws the x as two strokes", () => {
    expect(scribbleCrossPath(seedFromId("x")).match(/M /g)).toHaveLength(2);
  });
});
