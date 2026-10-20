import { describe, it, expect } from "vitest";
import { isLocale, LOCALE_NAMES, LOCALES, negotiateLocale, REGIONAL_TAG } from "../locales";

describe("the five locales", () => {
  it("are English, German, French, Italian and Spanish", () => {
    expect([...LOCALES]).toEqual(["en", "de", "fr", "it", "es"]);
  });

  // The product reads Swiss listings (#288): Swiss formatting for the three
  // national languages, Spain's for Spanish.
  it("format German, French and Italian the Swiss way", () => {
    expect(REGIONAL_TAG).toEqual({ en: "en", de: "de-CH", fr: "fr-CH", it: "it-CH", es: "es-ES" });
  });

  it("name each language in itself", () => {
    expect(LOCALE_NAMES).toEqual({ en: "English", de: "Deutsch", fr: "Français", it: "Italiano", es: "Español" });
  });

  it("recognise only the five", () => {
    expect(isLocale("de")).toBe(true);
    expect(isLocale("de-CH")).toBe(false);
    expect(isLocale("pt")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("negotiateLocale", () => {
  it("matches a regional tag on its language", () => {
    expect(negotiateLocale("de-CH")).toBe("de");
    expect(negotiateLocale("fr-CH,fr;q=0.9")).toBe("fr");
  });

  it("follows the weights, not the order", () => {
    expect(negotiateLocale("en;q=0.5, it;q=0.9")).toBe("it");
  });

  it("keeps the header's order among equal weights", () => {
    expect(negotiateLocale("es, de")).toBe("es");
  });

  it("skips languages it does not have and takes the next acceptable one", () => {
    expect(negotiateLocale("pt-BR, nl;q=0.8, de;q=0.5")).toBe("de");
  });

  it("treats q=0 as 'not this one'", () => {
    expect(negotiateLocale("de;q=0, fr;q=0.1")).toBe("fr");
  });

  it("answers null when nothing matches or there is no header", () => {
    expect(negotiateLocale("pt, ja")).toBeNull();
    expect(negotiateLocale("")).toBeNull();
    expect(negotiateLocale(null)).toBeNull();
    expect(negotiateLocale("*")).toBeNull();
  });
});
