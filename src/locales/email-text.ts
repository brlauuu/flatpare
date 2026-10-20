import { createTranslator } from "next-intl";
import de from "../../messages/de/emails.json";
import en from "../../messages/en/emails.json";
import es from "../../messages/es/emails.json";
import fr from "../../messages/fr/emails.json";
import it from "../../messages/it/emails.json";
import { DEFAULT_LOCALE, isLocale, REGIONAL_TAG, type Locale } from "./locales";

// The words of the emails, in a chosen language (#288). Lives in this leaf
// module, not in src/i18n, so src/lib (the invitation and removal emails) and
// src/auth.ts (the magic link) can read it without a module cycle:
// src/i18n reads the session and the database, and both of those reach back.
//
// messages/<locale>/emails.json is also read by scripts/beta-pass.mjs, which
// cannot import TypeScript — so the beta invitation and the app's emails
// share one set of words.
const CATALOGUES = { en, de, fr, it, es } as const;

export type EmailText = ReturnType<typeof emailText>;

export function emailText(locale: Locale) {
  return createTranslator({
    locale: REGIONAL_TAG[locale],
    messages: { emails: CATALOGUES[locale] as typeof en },
    namespace: "emails",
    timeZone: "Europe/Zurich",
  });
}

// The language to write to someone in: theirs if their account chose one,
// else the language of the person or page that caused the email, else
// English.
export function emailLocale(...candidates: (string | null | undefined)[]): Locale {
  for (const c of candidates) if (isLocale(c)) return c;
  return DEFAULT_LOCALE;
}
