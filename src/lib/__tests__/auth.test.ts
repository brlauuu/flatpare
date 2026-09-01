import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers before importing auth
vi.mock("next/headers", () => {
  const cookieStore = new Map<string, { value: string }>();
  return {
    cookies: vi.fn(async () => ({
      get: (name: string) => cookieStore.get(name),
      set: (name: string, value: string) => {
        cookieStore.set(name, { value });
      },
      _store: cookieStore,
    })),
    __cookieStore: cookieStore,
  };
});

import {
  isAuthenticated,
  setAuthenticated,
  getDisplayName,
  setDisplayName,
  verifyPassword,
} from "../auth";
import { authCookieValue, authCookieMatches } from "../auth-cookie";
import * as nextHeaders from "next/headers";

// __cookieStore is exposed by the vi.mock above; not in the real types.
const cookieStore = (nextHeaders as unknown as {
  __cookieStore: Map<string, { value: string }>;
}).__cookieStore;

beforeEach(() => {
  cookieStore.clear();
  process.env.APP_PASSWORD = "secret123";
});

describe("verifyPassword", () => {
  it("returns true for correct password", () => {
    process.env.APP_PASSWORD = "secret123";
    expect(verifyPassword("secret123")).toBe(true);
  });

  it("returns false for incorrect password", () => {
    process.env.APP_PASSWORD = "secret123";
    expect(verifyPassword("wrong")).toBe(false);
  });

  it("returns false when APP_PASSWORD is undefined", () => {
    delete process.env.APP_PASSWORD;
    expect(verifyPassword("anything")).toBe(false);
  });
});

describe("isAuthenticated", () => {
  it("returns false when no auth cookie is set", async () => {
    expect(await isAuthenticated()).toBe(false);
  });

  it("returns true after setAuthenticated is called", async () => {
    await setAuthenticated();
    expect(await isAuthenticated()).toBe(true);
  });
});

describe("getDisplayName / setDisplayName", () => {
  it("returns null when no name cookie is set", async () => {
    expect(await getDisplayName()).toBeNull();
  });

  it("returns the name after setDisplayName is called", async () => {
    await setDisplayName("Alice");
    expect(await getDisplayName()).toBe("Alice");
  });
});

describe("auth cookie", () => {
  it("issues an HMAC, not a static value", async () => {
    await setAuthenticated();
    const value = cookieStore.get("flatpare-auth")?.value;
    expect(value).not.toBe("true");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(value).toBe(authCookieValue());
  });

  it("rejects a hand-set 'true' cookie", async () => {
    cookieStore.set("flatpare-auth", { value: "true" });
    expect(await isAuthenticated()).toBe(false);
  });

  it("rejects a cookie minted under a different password", async () => {
    await setAuthenticated();
    process.env.APP_PASSWORD = "rotated";
    expect(await isAuthenticated()).toBe(false);
  });

  it("throws rather than issuing a cookie when APP_PASSWORD is unset", async () => {
    delete process.env.APP_PASSWORD;
    await expect(setAuthenticated()).rejects.toThrow("APP_PASSWORD is not set");
    expect(cookieStore.get("flatpare-auth")).toBeUndefined();
  });

  it("authCookieMatches handles missing values and wrong lengths", () => {
    expect(authCookieMatches(undefined)).toBe(false);
    expect(authCookieMatches("")).toBe(false);
    expect(authCookieMatches("short")).toBe(false);
    expect(authCookieMatches(authCookieValue() as string)).toBe(true);
  });

  it("authCookieValue returns null with no password configured", () => {
    delete process.env.APP_PASSWORD;
    expect(authCookieValue()).toBeNull();
    expect(authCookieMatches("anything")).toBe(false);
  });
});

describe("verifyPassword — timing safety", () => {
  it("returns false for empty input", () => {
    expect(verifyPassword("")).toBe(false);
  });

  it("returns false for a password differing only in length", () => {
    expect(verifyPassword("secret123extra")).toBe(false);
    expect(verifyPassword("secret12")).toBe(false);
  });
});
