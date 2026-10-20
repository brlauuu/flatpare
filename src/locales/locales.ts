// The five interface languages (#288). A leaf module (src/locales imports
// nothing from the app), so the proxy, src/auth.ts, src/lib, src/i18n,
// route handlers, the email layer and client components can all read it.
//
// A locale here is a language. Formatting uses the regional tag beside it:
// the product reads Swiss listings, so German, French and Italian follow
// Swiss conventions (and German is written without ß). Spanish is Spain's.

export const LOCALES = ["en", "de", "fr", "it", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// The cookie that holds the choice. Not httpOnly: nothing secret, and the
// selector is a client island.
export const LOCALE_COOKIE = "flatpare_locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// `<html lang>` and every number and date format. This is the locale
// next-intl is configured with (src/i18n/request.ts) — so a rent reads
// "CHF 2'650" in German, not Germany's "2.650" — while the bare language
// above names the catalogue and the cookie.
export const REGIONAL_TAG = {
  en: "en",
  de: "de-CH",
  fr: "fr-CH",
  it: "it-CH",
  es: "es-ES",
} as const satisfies Record<Locale, string>;
export type RegionalTag = (typeof REGIONAL_TAG)[Locale];

// The language a regional tag belongs to: what useLocale() returns, mapped
// back to the catalogue's name.
export function languageOf(tag: string): Locale {
  const language = tag.toLowerCase().split("-")[0];
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

// Each language named in itself, so someone who cannot read the current
// one can still find theirs.
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  es: "Español",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// The best supported language for an Accept-Language header, or null when
// none of the five is acceptable. Region subtags are matched on their
// language ("de-CH" and "de-AT" both mean German); weights order the
// candidates, and a weight of 0 means "not this one".
export function negotiateLocale(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { language: tag.trim().toLowerCase().split("-")[0], weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((c) => c.language && c.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { language } of ranked) {
    if (isLocale(language)) return language;
  }
  return null;
}

// Remembers a choice in this browser. A plain function, outside any
// component: what src/i18n/request.ts reads on the next request.
export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}
