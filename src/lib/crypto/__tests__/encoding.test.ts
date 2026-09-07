import { describe, it, expect } from "vitest";
import { toBase64, fromBase64 } from "../encoding";

describe("base64 helpers", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("accepts an ArrayBuffer", () => {
    expect(toBase64(new Uint8Array([104, 105]).buffer)).toBe("aGk=");
  });

  it("returns a Uint8Array backed by its own ArrayBuffer", () => {
    const out = fromBase64("aGk=");
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(out)).toEqual([104, 105]);
  });
});
