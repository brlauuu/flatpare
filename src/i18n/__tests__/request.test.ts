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
vi.mock("../account-locale", () => ({ readAccountLocale: async () => account.locale }));

import { resolveLocale } from "../request";

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
