import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers before importing auth
vi.mock("next/headers", () => {
  const cookieStore = new Map<string, { value: string }>();
  return {
    cookies: vi.fn(async () => ({
      get: (name: string) => cookieStore.get(name),
      set: (name: string, value: string, _options?: Record<string, unknown>) => {
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
import { __cookieStore } from "next/headers";

const cookieStore = __cookieStore as Map<string, { value: string }>;

beforeEach(() => {
  cookieStore.clear();
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
