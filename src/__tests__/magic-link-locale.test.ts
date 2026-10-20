import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";

// The magic link's language (#288): the account's choice, then the page the
// link was asked from (its cookie, then Accept-Language), then English.

const request = vi.hoisted(() => ({ inScope: true, cookie: undefined as string | undefined, acceptLanguage: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: () => {
    if (!request.inScope) throw new Error("outside a request scope");
    return Promise.resolve({ get: (n: string) => (n === "flatpare_locale" && request.cookie ? { value: request.cookie } : undefined) });
  },
  headers: () => {
    if (!request.inScope) throw new Error("outside a request scope");
    return Promise.resolve({ get: (n: string) => (n === "accept-language" ? request.acceptLanguage : null) });
  },
}));

import { magicLinkLocale } from "@/auth";

beforeEach(async () => {
  request.inScope = true;
  request.cookie = undefined;
  request.acceptLanguage = null;
  await db.delete(users);
  await db.insert(users).values({ id: "u1", email: "known@example.com", locale: "it" });
});

describe("magicLinkLocale", () => {
  it("writes to an existing account in the language it chose", async () => {
    request.cookie = "de";
    expect(await magicLinkLocale("known@example.com")).toBe("it");
  });

  it("writes to a new address in the language of the page it was asked from", async () => {
    request.cookie = "fr";
    request.acceptLanguage = "de";
    expect(await magicLinkLocale("new@example.com")).toBe("fr");
  });

  it("then follows the browser's languages", async () => {
    request.acceptLanguage = "es-ES,es;q=0.9";
    expect(await magicLinkLocale("new@example.com")).toBe("es");
  });

  it("outside a request, writes in English rather than failing", async () => {
    request.inScope = false;
    expect(await magicLinkLocale("new@example.com")).toBe("en");
  });
});
