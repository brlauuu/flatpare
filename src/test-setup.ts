import fs from "node:fs";
import path from "node:path";
import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";
import { setTestLocale, testLocale } from "./i18n/__tests__/test-locale";

// testing-library's waitFor/findBy ceiling, left at the 1000ms default.
//
// It was raised to 5000ms in #226 to hide flakes, then to 2000ms as a comfort
// margin. #227 removed the three actual races — a DOM/effect observation
// split, an uncancelled navigation timer leaking across tests, and two
// synchronous queries against asynchronously-opened popovers — so the margin
// should not be needed. Returned to the default deliberately, to prove that.
//
// If this starts flaking again, the answer is NOT to raise it: find the
// pending work the assertion is racing and give it an anchor. See AGENTS.md,
// Tests, for the two shapes that caused it last time.

// Give this test file its own database (#202).
//
// The real-database suites used to share one libSQL file, which produced ~36
// SQLITE_BUSY failures under file parallelism and forced
// `fileParallelism: false` — serializing the suite from ~22s to ~85s. A
// private copy per file removes the contention instead of avoiding it.
//
// The copy is of the already-migrated template built once by
// src/test-global-setup.ts, so this costs a file copy rather than a migration
// chain. Keyed on the pid because vitest runs each test file in its own
// process under `isolate: true`; a pid is therefore unique among the files
// running concurrently, which is the only uniqueness required.
//
// This must run before the test file's imports: `src/lib/db` reads
// LOCAL_DB_URL at module load.
const dataDir = path.join(process.cwd(), "data");
const dbFile = `test-${process.pid}.db`;
const dbPath = path.join(dataDir, dbFile);

process.env.LOCAL_DB_URL = `file:./data/${dbFile}`;

for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
fs.copyFileSync(path.join(dataDir, "test-template.db"), dbPath);

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
const files = import.meta.glob("../messages/*/*.json", { eager: true }) as Record<string, { default: Record<string, unknown> }>;
const catalogues: Record<string, Record<string, unknown>> = {};
for (const [file, mod] of Object.entries(files)) {
  const [, locale, ns] = file.match(/messages\/([^/]+)\/([^/]+)\.json$/)!;
  (catalogues[locale] ??= {})[ns] = mod.default;
}

const translators: Record<string, unknown> = {};
const formatters: Record<string, unknown> = {};

vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  const config = () => ({ locale: testLocale(), messages: catalogues[testLocale()] as never, timeZone: "Europe/Zurich" });
  return {
    ...real,
    useLocale: () => testLocale(),
    useMessages: () => catalogues[testLocale()],
    useTimeZone: () => "Europe/Zurich",
    // Cached per locale and namespace: next-intl's own `t` keeps its identity
    // across renders, and a component that lists `t` in an effect's
    // dependencies must not loop here when it doesn't in the app.
    useTranslations: (namespace?: string) => {
      const key = `${testLocale()}:${namespace ?? ""}`;
      return (translators[key] ??= real.createTranslator({ ...config(), namespace: namespace as never }));
    },
    useFormatter: () => (formatters[testLocale()] ??= real.createFormatter({ locale: testLocale(), timeZone: "Europe/Zurich" })),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("next-intl/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl/server")>();
  const { createTranslator, createFormatter } = await import("next-intl");
  return {
    ...real,
    getLocale: async () => testLocale(),
    getMessages: async () => catalogues[testLocale()],
    getTranslations: async (arg?: string | { namespace?: string }) =>
      createTranslator({
        locale: testLocale(),
        messages: catalogues[testLocale()] as never,
        timeZone: "Europe/Zurich",
        namespace: (typeof arg === "string" ? arg : arg?.namespace) as never,
      }),
    getFormatter: async () => createFormatter({ locale: testLocale(), timeZone: "Europe/Zurich" }),
  };
});
