import { describe, it, expect, afterEach } from "vitest";
import { readPublicAccess, PublicAccessConfigError } from "../public-access";

const ORIGINAL = process.env.FLATPARE_PUBLIC_ACCESS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FLATPARE_PUBLIC_ACCESS;
  else process.env.FLATPARE_PUBLIC_ACCESS = ORIGINAL;
});

describe("readPublicAccess", () => {
  // The self-hoster default, and a must-not-regress like every other
  // unset-means-unlimited switch (#187): `docker compose up` with no
  // configuration must never show a holding notice for someone else's launch.
  it("is open when the variable is unset", () => {
    delete process.env.FLATPARE_PUBLIC_ACCESS;
    expect(readPublicAccess()).toBe("open");
  });

  it("is open when the variable is empty or whitespace", () => {
    process.env.FLATPARE_PUBLIC_ACCESS = "";
    expect(readPublicAccess()).toBe("open");
    process.env.FLATPARE_PUBLIC_ACCESS = "   ";
    expect(readPublicAccess()).toBe("open");
  });

  it("accepts the two spelled-out values", () => {
    process.env.FLATPARE_PUBLIC_ACCESS = "open";
    expect(readPublicAccess()).toBe("open");
    process.env.FLATPARE_PUBLIC_ACCESS = "closed";
    expect(readPublicAccess()).toBe("closed");
    process.env.FLATPARE_PUBLIC_ACCESS = " closed ";
    expect(readPublicAccess()).toBe("closed");
  });

  // A typo must not silently open the door. "CLOSED", "true" and "1" all
  // read as an intent to close; coercing any of them to "open" is the worse
  // surprise, so the only safe answer is to refuse.
  it.each(["CLOSED", "true", "1", "yes", "off"])(
    "throws on %j rather than guessing",
    (raw) => {
      process.env.FLATPARE_PUBLIC_ACCESS = raw;
      expect(() => readPublicAccess()).toThrow(PublicAccessConfigError);
      expect(() => readPublicAccess()).toThrow(/FLATPARE_PUBLIC_ACCESS/);
    }
  );
});
