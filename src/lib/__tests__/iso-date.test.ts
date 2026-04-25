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
});
