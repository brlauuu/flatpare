import { beforeEach, vi } from "vitest";
import { REGIONAL_TAG } from "../locales";
import { setTestLocale, testLocale } from "./test-locale";

// Every test renders with real translations, without a provider (#288).
//
// Components read their strings through next-intl. Most tests render a
// component on its own and assert the English text, so the hooks are backed
// here by next-intl's own translator over the real catalogue — the same
// messages, placeholders and plurals as in the app, with no provider to
// forget. English by default; a test about language calls setTestLocale.
// Server components' getTranslations / getLocale are covered the same way.
beforeEach(() => setTestLocale("en"));

// Every catalogue file present, read eagerly; a locale whose files are not
// written yet simply has none, and a test that asks for it gets English keys
// back instead of a crash.
const files = import.meta.glob("../../../messages/*/*.json", { eager: true }) as Record<string, { default: Record<string, unknown> }>;
const catalogues: Record<string, Record<string, unknown>> = {};
for (const [file, mod] of Object.entries(files)) {
  const [, locale, ns] = file.match(/messages\/([^/]+)\/([^/]+)\.json$/)!;
  (catalogues[locale] ??= {})[ns] = mod.default;
}

const translators: Record<string, unknown> = {};
const formatters: Record<string, unknown> = {};

vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  const config = () => ({ locale: REGIONAL_TAG[testLocale()], messages: catalogues[testLocale()] as never, timeZone: "Europe/Zurich" });
  return {
    ...real,
    // The regional tag, as src/i18n/request.ts configures the app.
    useLocale: () => REGIONAL_TAG[testLocale()],
    useMessages: () => catalogues[testLocale()],
    useTimeZone: () => "Europe/Zurich",
    // Cached per locale and namespace: next-intl's own `t` keeps its identity
    // across renders, and a component that lists `t` in an effect's
    // dependencies must not loop here when it doesn't in the app.
    useTranslations: (namespace?: string) => {
      const key = `${testLocale()}:${namespace ?? ""}`;
      return (translators[key] ??= real.createTranslator({ ...config(), namespace: namespace as never }));
    },
    useFormatter: () => (formatters[testLocale()] ??= real.createFormatter({ locale: REGIONAL_TAG[testLocale()], timeZone: "Europe/Zurich" })),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("next-intl/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl/server")>();
  const { createTranslator, createFormatter } = await import("next-intl");
  return {
    ...real,
    getLocale: async () => REGIONAL_TAG[testLocale()],
    getMessages: async () => catalogues[testLocale()],
    getTranslations: async (arg?: string | { namespace?: string }) =>
      createTranslator({
        locale: REGIONAL_TAG[testLocale()],
        messages: catalogues[testLocale()] as never,
        timeZone: "Europe/Zurich",
        namespace: (typeof arg === "string" ? arg : arg?.namespace) as never,
      }),
    getFormatter: async () => createFormatter({ locale: REGIONAL_TAG[testLocale()], timeZone: "Europe/Zurich" }),
  };
});
