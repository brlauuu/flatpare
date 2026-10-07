import { describe, it, expect } from "vitest";
import { pencilCirclePath, seedFromId, starPath } from "../marks";

describe("pencil marks", () => {
  it("draws the same circle for the same apartment every time", () => {
    const id = "6f1c2b9e-0000-4000-8000-000000000001";
    expect(pencilCirclePath(seedFromId(id))).toBe(pencilCirclePath(seedFromId(id)));
  });

  it("draws different circles for different apartments", () => {
    const a = pencilCirclePath(seedFromId("6f1c2b9e-0000-4000-8000-000000000001"));
    const b = pencilCirclePath(seedFromId("6f1c2b9e-0000-4000-8000-000000000002"));
    expect(a).not.toBe(b);
  });

  it("produces an open SVG path (starts with M, no Z) inside the 64×44 box with slack", () => {
    const d = pencilCirclePath(seedFromId("x"));
    expect(d.startsWith("M ")).toBe(true);
    expect(d).not.toContain("Z");
    const nums = d.replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(-2);
      expect(nums[i]).toBeLessThanOrEqual(66);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(-2);
      expect(nums[i + 1]).toBeLessThanOrEqual(46);
    }
  });

  it("star is a closed path", () => {
    expect(starPath().trim().endsWith("Z")).toBe(true);
  });
});
