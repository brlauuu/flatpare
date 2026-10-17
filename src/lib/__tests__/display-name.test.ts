import { describe, it, expect } from "vitest";
import { MAX_DISPLAY_NAME, displayName, parseDisplayName } from "../display-name";

describe("displayName", () => {
  it("shows the name when one is set", () => {
    expect(displayName("Lena", "lena@example.com")).toBe("Lena");
  });

  it("falls back to the email when there is no name (#205, #327)", () => {
    expect(displayName(null, "lena@example.com")).toBe("lena@example.com");
    expect(displayName("", "lena@example.com")).toBe("lena@example.com");
    expect(displayName("   ", "lena@example.com")).toBe("lena@example.com");
  });
});

describe("parseDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(parseDisplayName("  Lena   Muster ")).toEqual({ ok: true, name: "Lena Muster" });
  });

  it("treats an empty value as clearing the name", () => {
    expect(parseDisplayName("")).toEqual({ ok: true, name: null });
    expect(parseDisplayName("   ")).toEqual({ ok: true, name: null });
  });

  it("accepts letters from any script", () => {
    expect(parseDisplayName("Đorđe Relić")).toEqual({ ok: true, name: "Đorđe Relić" });
    expect(parseDisplayName("李雷")).toEqual({ ok: true, name: "李雷" });
  });

  it("refuses line breaks and other control characters (the name reaches email subjects)", () => {
    expect(parseDisplayName("Lena\nBcc: x@example.com").ok).toBe(false);
    expect(parseDisplayName("Lena\r").ok).toBe(false);
    expect(parseDisplayName("Le\u0000na").ok).toBe(false);
    expect(parseDisplayName("Le\u202Ena").ok).toBe(false); // bidi override
  });

  it(`allows at most ${MAX_DISPLAY_NAME} characters`, () => {
    expect(parseDisplayName("a".repeat(MAX_DISPLAY_NAME))).toEqual({ ok: true, name: "a".repeat(MAX_DISPLAY_NAME) });
    expect(parseDisplayName("a".repeat(MAX_DISPLAY_NAME + 1)).ok).toBe(false);
  });

  it("counts characters, not UTF-16 units, so emoji are not over-counted", () => {
    expect(parseDisplayName("🏠".repeat(MAX_DISPLAY_NAME)).ok).toBe(true);
  });

  it("refuses anything that is not a string", () => {
    expect(parseDisplayName(42).ok).toBe(false);
    expect(parseDisplayName(undefined).ok).toBe(false);
  });

  it("says why, in a fixed message that never echoes the input", () => {
    const r = parseDisplayName("secret\nvalue");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain("secret");
  });
});
