import { describe, it, expect, beforeEach, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookie: undefined as string | undefined, acceptLanguage: null as string | null }));
const session = vi.hoisted(() => ({ value: null as null | { user: { id: string } }, fails: false }));
const account = vi.hoisted(() => ({ locale: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "flatpare_locale" && jar.cookie ? { value: jar.cookie } : undefined) }),
  headers: async () => ({ get: (name: string) => (name === "accept-language" ? jar.acceptLanguage : null) }),
}));
vi.mock("@/auth", () => ({
  auth: async () => {
    if (session.fails) throw new Error("no request scope");
    return session.value;
  },
}));
// Outside the Next compiler next-intl/server resolves to its client build,
// which refuses getRequestConfig; as the identity, the test runs the config.
vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));
vi.mock("../account-locale", () => ({ readAccountLocale: async () => account.locale }));

import requestConfig, { resolveLocale } from "../request";

beforeEach(() => {
  jar.cookie = undefined;
  jar.acceptLanguage = null;
  session.value = null;
  session.fails = false;
  account.locale = null;
});

describe("resolveLocale", () => {
  it("takes the cookie first", async () => {
    jar.cookie = "it";
    session.value = { user: { id: "u1" } };
    account.locale = "fr";
    jar.acceptLanguage = "de";
    expect(await resolveLocale()).toBe("it");
  });

  it("ignores a cookie that names no supported locale", async () => {
    jar.cookie = "klingon";
    jar.acceptLanguage = "es";
    expect(await resolveLocale()).toBe("es");
  });

  // A new device: signed in, no cookie yet.
  it("then the account's choice", async () => {
    session.value = { user: { id: "u1" } };
    account.locale = "fr";
    jar.acceptLanguage = "de";
    expect(await resolveLocale()).toBe("fr");
  });

  it("then the browser's languages", async () => {
    session.value = { user: { id: "u1" } };
    jar.acceptLanguage = "de-CH,de;q=0.9,en;q=0.8";
    expect(await resolveLocale()).toBe("de");
  });

  it("then English", async () => {
    jar.acceptLanguage = "pt-BR";
    expect(await resolveLocale()).toBe("en");
  });

  it("reads a failing session as signed out, never as an error page", async () => {
    session.fails = true;
    jar.acceptLanguage = "it";
    expect(await resolveLocale()).toBe("it");
  });
});

// next-intl formats numbers and dates with the locale it is configured
// with. Configured with "de", a rent read "CHF 2.650" (Germany); Swiss
// German writes 2'650. The catalogue is still the language's.
describe("the request config", () => {
  it("configures next-intl with the regional tag and the language's catalogue", async () => {
    jar.cookie = "de";
    const config = await (requestConfig as unknown as (p: { requestLocale: Promise<string | undefined> }) => Promise<{
      locale: string;
      messages: Record<string, Record<string, unknown>>;
      timeZone: string;
    }>)({ requestLocale: Promise.resolve(undefined) });
    expect(config.locale).toBe("de-CH");
    expect(config.timeZone).toBe("Europe/Zurich");
    expect(config.messages.common.save).toBe("Speichern");
    expect(new Intl.NumberFormat(config.locale).format(2650)).toMatch(/^2[’']650$/);
  });
});
