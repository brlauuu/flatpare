import { describe, it, expect } from "vitest";
import {
  compareCurrencies,
  normalizeCurrency,
  rentCurrencyOf,
  rentFormatOptions,
} from "../rent";
import { apartmentSchema } from "../schemas";
import { emptyApartment } from "../types";

// #427: a rent in the listing's own currency.
describe("normalizeCurrency", () => {
  it.each([
    ["CHF", "CHF"],
    [" eur ", "EUR"],
    ["€", "EUR"],
    ["$", "USD"],
    ["£", "GBP"],
    ["Fr.", "CHF"],
    ["SFr.", "CHF"],
    ["SEK", "SEK"],
  ])("reads %s as %s", (raw, code) => {
    expect(normalizeCurrency(raw)).toBe(code);
  });

  it.each([null, undefined, 12, "", "euros", "EU", "EURO"])("has nothing for %s", (raw) => {
    expect(normalizeCurrency(raw)).toBeNull();
  });
});

describe("rentCurrencyOf", () => {
  it("is the apartment's currency, or francs when it names none", () => {
    expect(rentCurrencyOf({ rentCurrency: "EUR" })).toBe("EUR");
    expect(rentCurrencyOf({ rentCurrency: null })).toBe("CHF");
  });
});

describe("compareCurrencies", () => {
  it("puts francs first and the rest by code", () => {
    expect(["USD", "EUR", "CHF", "GBP"].sort(compareCurrencies)).toEqual(["CHF", "EUR", "GBP", "USD"]);
    expect(compareCurrencies("EUR", "EUR")).toBe(0);
  });
});

describe("rentFormatOptions", () => {
  it("writes the currency, with cents only when the rent has them", () => {
    const fmt = (amount: number, currency: string) =>
      new Intl.NumberFormat("de-CH", rentFormatOptions(amount, currency)).format(amount);
    expect(fmt(2650, "CHF")).toMatch(/^CHF\s2'650$/);
    expect(fmt(1200, "EUR")).toMatch(/^EUR\s1'200$/);
    expect(fmt(1200.5, "EUR")).toMatch(/^EUR\s1'200\.50$/);
  });
});

describe("apartmentSchema rentCurrency", () => {
  it("reads a rent saved before #427 as francs", () => {
    const { rentCurrency: _omit, ...old } = { ...emptyApartment("Old"), rentChf: 2000 };
    void _omit;
    expect(apartmentSchema.parse(old).rentCurrency).toBe("CHF");
  });

  it("leaves no currency on an older apartment without a rent", () => {
    const { rentCurrency: _omit, ...old } = emptyApartment("Old");
    void _omit;
    expect(apartmentSchema.parse(old).rentCurrency).toBeNull();
  });

  it("keeps the currency it was saved with", () => {
    expect(apartmentSchema.parse({ ...emptyApartment("New"), rentChf: 900, rentCurrency: "EUR" }).rentCurrency).toBe("EUR");
  });

  it("refuses a currency that is not an ISO code", () => {
    expect(apartmentSchema.safeParse({ ...emptyApartment("x"), rentChf: 900, rentCurrency: "€" }).success).toBe(false);
  });
});
