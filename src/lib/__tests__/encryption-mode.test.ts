import { describe, it, expect } from "vitest";
import { readEncryptionMode } from "../encryption-mode";

describe("readEncryptionMode", () => {
  it("defaults to on when unset or empty", () => {
    expect(readEncryptionMode(undefined)).toBe("on");
    expect(readEncryptionMode("")).toBe("on");
  });

  it("accepts the two documented values", () => {
    expect(readEncryptionMode("on")).toBe("on");
    expect(readEncryptionMode("off")).toBe("off");
  });

  it("rejects anything else, naming the variable", () => {
    expect(() => readEncryptionMode("false")).toThrow(/FLATPARE_ENCRYPTION/);
    expect(() => readEncryptionMode("OFF")).toThrow(/FLATPARE_ENCRYPTION/);
  });
});
