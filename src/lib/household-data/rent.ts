// The currency a rent is listed in (#427). A leaf: the schemas, the PDF
// extraction, the sort, the map text and the components all read it.
//
// The amount stays in `rentChf`, a name older than this module: it holds the
// rent in `rentCurrency`, whatever that is. Nothing converts between
// currencies (decided on #427: an exchange-rate service would be one more
// outside party), so sorting groups rents by currency and the compare table
// picks the cheapest within each.

export const DEFAULT_RENT_CURRENCY = "CHF";

// What the form offers. A listing in another currency keeps its own code,
// and the form adds it to the list for that apartment.
export const RENT_CURRENCIES = ["CHF", "EUR", "USD", "GBP"] as const;

export const CURRENCY_CODE = /^[A-Z]{3}$/;

const SYMBOLS: Record<string, string> = {
  "€": "EUR",
  "$": "USD",
  "US$": "USD",
  "£": "GBP",
  "FR.": "CHF",
  "SFR.": "CHF",
  "FR": "CHF",
  "SFR": "CHF",
};

// An ISO 4217 code from what the extraction or an older export says, or null
// when it says nothing usable.
export function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();
  if (CURRENCY_CODE.test(value)) return value;
  return SYMBOLS[value] ?? null;
}

// The currency to show a rent in. A rent saved before #427 has none and was
// in francs.
export function rentCurrencyOf(a: { rentCurrency: string | null }): string {
  return a.rentCurrency ?? DEFAULT_RENT_CURRENCY;
}

// The order rents of different currencies are grouped in: francs first, the
// rest by code.
export function compareCurrencies(a: string, b: string): number {
  if (a === b) return 0;
  if (a === DEFAULT_RENT_CURRENCY) return -1;
  if (b === DEFAULT_RENT_CURRENCY) return 1;
  return a < b ? -1 : 1;
}

// How a rent is written: in its currency, with cents only when it has them.
export interface RentFormatOptions {
  style: "currency";
  currency: string;
  minimumFractionDigits: number;
  maximumFractionDigits: number;
}

export function rentFormatOptions(amount: number, currency: string): RentFormatOptions {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits };
}
