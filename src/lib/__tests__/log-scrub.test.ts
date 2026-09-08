import { describe, it, expect } from "vitest";
import { scrubbedErrorLine } from "../log-scrub";

describe("scrubbedErrorLine", () => {
  it("names the error class and nothing else", () => {
    const err = new TypeError(
      "fetch failed for https://maps.googleapis.com/maps/api/geocode/json?address=Bahnhofstrasse+1&key=SECRET"
    );
    expect(scrubbedErrorLine(err)).toBe("TypeError");
  });

  it("keeps a numeric status, which carries no request content", () => {
    const err = Object.assign(new Error("boom"), { status: 429 });
    expect(scrubbedErrorLine(err)).toBe("Error status=429");
  });

  it("ignores a non-numeric status rather than stringifying it", () => {
    const err = Object.assign(new Error("boom"), { status: "Bahnhofstrasse 1" });
    expect(scrubbedErrorLine(err)).toBe("Error");
  });

  it("never returns the message for a non-Error", () => {
    expect(scrubbedErrorLine("Bahnhofstrasse 1")).toBe("NonError");
    expect(scrubbedErrorLine({ message: "Bahnhofstrasse 1" })).toBe("NonError");
    expect(scrubbedErrorLine(undefined)).toBe("NonError");
  });

  it("does not walk to a cause, which may carry the URL", () => {
    const inner = new Error("https://maps.googleapis.com/?address=Bahnhofstrasse+1");
    const outer = new Error("wrapped", { cause: inner });
    expect(scrubbedErrorLine(outer)).toBe("Error");
  });

  it("keeps a custom error class name, which is the useful signal", () => {
    class UnsafeUrlError extends Error {
      constructor(m: string) {
        super(m);
        this.name = "UnsafeUrlError";
      }
    }
    expect(scrubbedErrorLine(new UnsafeUrlError("private address"))).toBe("UnsafeUrlError");
  });
});
