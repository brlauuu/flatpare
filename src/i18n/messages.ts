import type { Locale } from "./locales";

// The catalogues (#288): messages/<locale>/<namespace>.json, one file per
// area per language, so the areas of the app can be translated and reviewed
// apart. English is the source; src/i18n/__tests__/catalogues.test.ts keeps
// the other four in step with it.
//
// A new namespace: add its name here and its type in global.d.ts, and a file
// for it in every locale.
export const NAMESPACES = [
  "common",
  "language",
  "nav",
  "apartments",
  "compare",
  "map",
  "household",
  "settings",
  "crypto",
  "auth",
  "invitations",
  "billing",
  "errors",
  "landing",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export async function loadMessages(locale: Locale): Promise<Record<Namespace, Record<string, unknown>>> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const)
  );
  return Object.fromEntries(entries) as Record<Namespace, Record<string, unknown>>;
}
