import { describe, it, expect } from "vitest";
import {
  formatRecoveryCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from "../recovery";

describe("recovery codes", () => {
  it("generates five dash-separated groups of five base32 chars", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){4}$/);
    expect(generateRecoveryCode()).not.toBe(code);
  });

  it("normalizes case and separators back to the 25-char compact form", () => {
    const code = generateRecoveryCode();
    const compact = code.replaceAll("-", "");
    expect(normalizeRecoveryCode(code)).toBe(compact);
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(compact);
    expect(normalizeRecoveryCode(` ${code.replaceAll("-", " ")} `)).toBe(compact);
    expect(formatRecoveryCode(compact)).toBe(code);
  });

  it("rejects a code with a wrong check character or wrong length", () => {
    const compact = generateRecoveryCode().replaceAll("-", "");
    const badCheck =
      compact.slice(0, 24) + (compact[24] === "A" ? "B" : "A");
    expect(normalizeRecoveryCode(badCheck)).toBeNull();
    expect(normalizeRecoveryCode(compact.slice(0, 24))).toBeNull();
    expect(normalizeRecoveryCode("")).toBeNull();
  });

  it("rejects a single-character typo", () => {
    const compact = generateRecoveryCode().replaceAll("-", "");
    const replacement = compact[0] === "A" ? "B" : "A";
    expect(normalizeRecoveryCode(replacement + compact.slice(1))).toBeNull();
  });
});
