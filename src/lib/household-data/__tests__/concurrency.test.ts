import { describe, it, expect } from "vitest";
import { mapConcurrent } from "../concurrency";

describe("mapConcurrent", () => {
  it("preserves order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapConcurrent([], 3, async () => 1)).toEqual([]);
  });

  it("rejects when any item rejects", async () => {
    await expect(
      mapConcurrent([1, 2], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });
});
