import { describe, it, expect, afterEach } from "vitest";
import { readOptionalPositiveInt, EnvConfigError } from "../env-int";

const NAME = "FLATPARE_TEST_INT";

afterEach(() => {
  delete process.env[NAME];
});

describe("readOptionalPositiveInt", () => {
  it("is null when unset — every caller treats that as unlimited", () => {
    expect(readOptionalPositiveInt(NAME)).toBeNull();
  });

  it("is null when empty or whitespace, which is how an unset Vercel var arrives", () => {
    process.env[NAME] = "";
    expect(readOptionalPositiveInt(NAME)).toBeNull();
    process.env[NAME] = "   ";
    expect(readOptionalPositiveInt(NAME)).toBeNull();
  });

  it("reads a positive integer, ignoring surrounding whitespace", () => {
    process.env[NAME] = " 20 ";
    expect(readOptionalPositiveInt(NAME)).toBe(20);
    process.env[NAME] = "1";
    expect(readOptionalPositiveInt(NAME)).toBe(1);
  });

  it("refuses anything that is not a positive integer rather than coercing", () => {
    for (const bad of ["0", "-1", "1.5", "1e3", "abc", "Infinity", "20x", "0x14", "+20"]) {
      process.env[NAME] = bad;
      expect(() => readOptionalPositiveInt(NAME), bad).toThrow(EnvConfigError);
    }
  });

  it("names the variable in the error, so the operator knows which one to fix", () => {
    process.env[NAME] = "nope";
    expect(() => readOptionalPositiveInt(NAME)).toThrow(new RegExp(NAME));
  });

  it("reads each variable independently", () => {
    process.env[NAME] = "5";
    expect(readOptionalPositiveInt(NAME)).toBe(5);
    expect(readOptionalPositiveInt("FLATPARE_TEST_INT_OTHER")).toBeNull();
  });
});
