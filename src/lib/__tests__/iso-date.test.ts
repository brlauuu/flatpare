import { describe, it, expect } from "vitest";
import { formatSwissDate, isIsoDate } from "@/lib/iso-date";

describe("isIsoDate", () => {
  it("accepts a well-formed ISO date", () => {
    expect(isIsoDate("2026-05-01")).toBe(true);
  });

  it("rejects a Swiss-format date", () => {
    expect(isIsoDate("01.05.2026")).toBe(false);
  });

  it("rejects free text like 'ab sofort'", () => {
    expect(isIsoDate("ab sofort")).toBe(false);
  });
});

describe("formatSwissDate", () => {
  it("converts ISO YYYY-MM-DD to DD.MM.YYYY", () => {
    expect(formatSwissDate("2026-05-01")).toBe("01.05.2026");
  });

  it("preserves the digits exactly", () => {
    expect(formatSwissDate("2026-12-31")).toBe("31.12.2026");
  });

  describe("returns non-ISO input unchanged (#262)", () => {
    // `availableFrom` is `nullableString` in the envelope schema, so whatever
    // the PDF extraction produced lands here. Before the guard, anything
    // containing a hyphen was split and reversed into quiet nonsense on the
    // apartment page.
    it.each([
      ["a German listing phrase with a hyphen", "ab 1-2 Monate", "ab 1-2 Monate"],
      ["a partial date", "2026-05", "2026-05"],
      ["a Swiss-format date", "01.05.2026", "01.05.2026"],
      ["free text", "ab sofort", "ab sofort"],
      ["an empty string", "", ""],
    ])("%s", (_label, input, expected) => {
      expect(formatSwissDate(input)).toBe(expected);
    });

    it("no longer reverses a hyphenated phrase into nonsense", () => {
      // The old implementation answered "2 Monate.1.ab " for this.
      expect(formatSwissDate("ab 1-2 Monate")).not.toContain(".");
    });
  });
});
