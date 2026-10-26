import { describe, it, expect } from "vitest";
import { parseByteRange } from "../byte-range";

describe("parseByteRange", () => {
  it("is none without a header", () => {
    expect(parseByteRange(null, 100)).toBe("none");
  });

  it("reads a closed, an open and a suffix range", () => {
    expect(parseByteRange("bytes=0-126", 1000)).toEqual({ start: 0, end: 126 });
    expect(parseByteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("clips an end past the file", () => {
    expect(parseByteRange("bytes=990-2000", 1000)).toEqual({ start: 990, end: 999 });
  });

  it("refuses what it cannot serve", () => {
    for (const h of ["bytes=1000-", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=0-1,5-6", "items=0-1", "bytes=a-b"]) {
      expect(parseByteRange(h, 1000)).toBe("unsatisfiable");
    }
    expect(parseByteRange("bytes=-1", 0)).toBe("unsatisfiable");
  });
});
