import { describe, it, expect } from "vitest";
import {
  buildShortCode,
  freshLetters,
  isValidLetters,
  lettersProblem,
  lettersOf,
  pickLetters,
  postcodeFromShortCode,
  syncShortCode,
  withLetters,
  withPostcode,
} from "../short-code";
import { emptyApartment } from "../types";

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

  it("re-rolls letters until no other apartment uses them", () => {
    // Pool is 23 letters; floor(0.5 * 23) = 11, the pool's index for "N".
    const rolls = [0, 0, 0, 0.5, 0.5, 0.5]; // AAA then NNN
    let i = 0;
    expect(freshLetters(new Set(["AAA"]), () => rolls[i++ % rolls.length])).toBe("NNN");
  });

  it("accepts any three capital letters, I, O and L included", () => {
    expect(isValidLetters("KXR")).toBe(true);
    expect(isValidLetters("OIL")).toBe(true);
    for (const bad of ["kxr", "KX", "KXRS", "K1R", "", "ÄBC"]) expect(isValidLetters(bad)).toBe(false);
  });

  it("reads the letters out of a code, null for a code without them", () => {
    expect(lettersOf("KXR-3B-1b-WY-8001")).toBe("KXR");
    expect(lettersOf("2R1B")).toBeNull();
    expect(lettersOf(null)).toBeNull();
  });
  it("reads the postcode back out of a code", () => {
    expect(postcodeFromShortCode("ABC-3.5B-1b-WY-8001")).toBe("8001");
    expect(postcodeFromShortCode("ABC-3.5B-1b-WY-?")).toBeNull();
    expect(postcodeFromShortCode("garbage")).toBeNull();
  });
});

describe("syncShortCode (#410)", () => {
  const flat = {
    ...emptyApartment("Flat"),
    address: "Street 5",
    numRooms: 3,
    numBathrooms: null,
    shortCode: "KXR-3B-?b-W?-8004",
  };

  it("follows an added bathroom and keeps the letters and postcode", () => {
    const next = syncShortCode(flat, { ...flat, numBathrooms: 1 }, new Set());
    expect(next.shortCode).toBe("KXR-3B-1b-W?-8004");
  });

  it("follows rooms and washing machine too", () => {
    const next = syncShortCode(flat, { ...flat, numRooms: 4.5, hasWashingMachine: true }, new Set());
    expect(next.shortCode).toBe("KXR-4.5B-?b-WY-8004");
  });

  it("clears the postcode when the address changes, until it is geocoded", () => {
    const next = syncShortCode(flat, { ...flat, address: "Elsewhere 9" }, new Set());
    expect(next.shortCode).toBe("KXR-3B-?b-W?-?");
  });

  it("leaves an unchanged apartment's code as it was", () => {
    expect(syncShortCode(flat, { ...flat, rentChf: 2000 }, new Set()).shortCode).toBe(flat.shortCode);
  });

  it("gives a new apartment letters nobody else uses", () => {
    const rolls = [0, 0, 0, 0.5, 0.5, 0.5];
    let i = 0;
    const next = syncShortCode(null, { ...emptyApartment("New"), numRooms: 2 }, new Set(["AAA"]), () => rolls[i++]);
    expect(next.shortCode).toBe("NNN-2B-?b-W?-?");
  });

  it("keeps an imported or legacy code's letters and postcode on create", () => {
    const next = syncShortCode(null, { ...flat }, new Set(["KXR"]));
    expect(next.shortCode).toBe("KXR-3B-?b-W?-8004");
  });

  it("replaces a legacy code without letters", () => {
    const next = syncShortCode(flat, { ...flat, shortCode: "2R1B" }, new Set(), () => 0);
    expect(next.shortCode).toBe("AAA-3B-?b-W?-?");
  });
});

describe("withLetters / withPostcode", () => {
  const flat = { ...emptyApartment("Flat"), numRooms: 2, shortCode: "KXR-2B-?b-W?-8004" };

  it("changes only the letters", () => {
    expect(withLetters(flat, "OIL").shortCode).toBe("OIL-2B-?b-W?-8004");
  });

  it("builds a whole code when the apartment had none", () => {
    expect(withLetters({ ...flat, shortCode: null }, "ABC").shortCode).toBe("ABC-2B-?b-W?-?");
  });

  it("changes only the postcode", () => {
    expect(withPostcode(flat, "8001", new Set()).shortCode).toBe("KXR-2B-?b-W?-8001");
    expect(withPostcode(flat, null, new Set()).shortCode).toBe("KXR-2B-?b-W?-?");
  });
});

describe("lettersProblem", () => {
  const takenBy = new Map([["ABC", "Sonnenweg 3"]]);

  it("accepts free letters, and an apartment's own", () => {
    expect(lettersProblem("KXR", "KXR", takenBy)).toBeNull();
    expect(lettersProblem("OIL", "KXR", takenBy)).toBeNull();
  });

  it("names the apartment that already uses the letters", () => {
    expect(lettersProblem("ABC", "KXR", takenBy)).toEqual({ kind: "taken", by: "Sonnenweg 3" });
  });

  it("refuses anything but three letters", () => {
    expect(lettersProblem("AB", "KXR", takenBy)).toEqual({ kind: "invalid" });
    expect(lettersProblem("", "KXR", takenBy)).toEqual({ kind: "invalid" });
  });

  it("lets an apartment without letters leave the field empty", () => {
    expect(lettersProblem("", null, takenBy)).toBeNull();
  });
});
