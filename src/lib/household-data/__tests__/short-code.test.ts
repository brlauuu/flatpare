import { describe, it, expect } from "vitest";
import { buildShortCode, pickLetters, postcodeFromShortCode, uniqueShortCode } from "../short-code";

const parts = { numRooms: 3.5, numBathrooms: 1, hasWashingMachine: true, postcode: "8001" };

describe("short-code", () => {
  it("builds the documented format", () => {
    expect(buildShortCode(parts, "ABC")).toBe("ABC-3.5B-1b-WY-8001");
    expect(
      buildShortCode({ numRooms: null, numBathrooms: null, hasWashingMachine: null, postcode: null }, "XYZ")
    ).toBe("XYZ-?B-?b-W?-?");
    expect(buildShortCode({ ...parts, hasWashingMachine: false }, "ABC")).toBe("ABC-3.5B-1b-WN-8001");
  });

  it("picks letters from the 23-letter pool only", () => {
    for (let i = 0; i < 200; i++) {
      expect(pickLetters()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{3}$/);
    }
    expect(pickLetters(() => 0)).toBe("AAA");
    expect(pickLetters(() => 0.999)).toBe("ZZZ");
  });

  it("re-rolls letters until the code is not taken", () => {
    // Pool is 23 letters; floor(0.5 * 23) = 11, the pool's index for "N".
    const rolls = [0, 0, 0, 0.5, 0.5, 0.5]; // AAA then NNN
    let i = 0;
    const random = () => rolls[i++ % rolls.length];
    const taken = new Set(["AAA-3.5B-1b-WY-8001"]);
    expect(uniqueShortCode(parts, taken, random)).toBe("NNN-3.5B-1b-WY-8001");
  });

  it("reads the postcode back out of a code", () => {
    expect(postcodeFromShortCode("ABC-3.5B-1b-WY-8001")).toBe("8001");
    expect(postcodeFromShortCode("ABC-3.5B-1b-WY-?")).toBeNull();
    expect(postcodeFromShortCode("garbage")).toBeNull();
  });
});
