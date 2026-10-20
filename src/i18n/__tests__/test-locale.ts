import type { Locale } from "@/locales/locales";

// The locale the test-wide next-intl stand-in (src/test-setup.ts) renders
// in. English unless a test about language sets another; reset before
// every test.
//
// Held on globalThis rather than in a module variable: a test that calls
// vi.resetModules() would otherwise import a fresh copy of this module and
// set a locale the stand-in never reads.
const KEY = Symbol.for("flatpare.testLocale");
type Holder = { [KEY]?: Locale };

export function setTestLocale(locale: Locale) {
  (globalThis as Holder)[KEY] = locale;
}

export function testLocale(): Locale {
  return (globalThis as Holder)[KEY] ?? "en";
}
