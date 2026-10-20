import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { auth } from "@/auth";
import { readAccountLocale } from "./account-locale";
import { loadMessages } from "./messages";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, REGIONAL_TAG, type Locale } from "@/locales/locales";

// The language of one request (#288). Same URLs in every language: the
// locale is never in the path, so nothing about routing, the proxy or
// Auth.js changes. First match wins:
//   1. the cookie the selector sets;
//   2. signed in without the cookie (a new device): the account's choice;
//   3. the browser's Accept-Language;
//   4. English.
// cookies() and headers() throw, synchronously, outside a request scope.
async function outsideRequestIsNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export async function resolveLocale(): Promise<Locale> {
  // Outside a request (a script, a test) there is no cookie or header:
  // English, never an error — an email must not fail over its language.
  const store = await outsideRequestIsNull(cookies);
  if (!store) return DEFAULT_LOCALE;
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (userId) {
    const fromAccount = await readAccountLocale(userId).catch(() => null);
    if (fromAccount) return fromAccount;
  }

  const head = await outsideRequestIsNull(headers);
  return negotiateLocale(head?.get("accept-language")) ?? DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const language = await resolveLocale();
  return {
    // The regional tag, so numbers and dates follow Swiss conventions; the
    // catalogue is the language's.
    locale: REGIONAL_TAG[language],
    messages: await loadMessages(language),
    // Fixed, so a date renders the same on the server and in the browser.
    timeZone: "Europe/Zurich",
  };
});
