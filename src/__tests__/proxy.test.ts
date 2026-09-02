import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "../proxy";
import { authCookieValue } from "@/lib/auth-cookie";

beforeAll(() => {
  process.env.APP_PASSWORD = "test-password";
});

function makeRequest(
  path: string,
  cookies: Record<string, string> = {}
): NextRequest {
  const url = `http://localhost:3002${path}`;
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

// The auth cookie is an HMAC keyed by APP_PASSWORD, so tests have to mint a
// real one — which is the point: "true" no longer opens anything.
const authCookie = () => authCookieValue() as string;
const authedCookies = () => ({
  "flatpare-auth": authCookie(),
  "flatpare-name": "Alice",
});

describe("proxy — login page", () => {
  it("lets an unauthenticated visitor see the login page", () => {
    const res = proxy(makeRequest("/"));
    // x-middleware-next: 1 indicates NextResponse.next()
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects an authed visitor away from the login page", () => {
    const res = proxy(makeRequest("/", authedCookies()));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/apartments");
  });
});

describe("proxy — /api/auth bypass", () => {
  it("lets unauthenticated callers reach /api/auth", () => {
    const res = proxy(makeRequest("/api/auth"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  // Regression guard: the allow-list used to be startsWith("/api/auth"),
  // which left every one of these reachable without the password.
  const guardedAuthPaths = [
    "/api/auth/name",
    "/api/auth/users",
    "/api/auth/users/Alice",
  ];

  for (const path of guardedAuthPaths) {
    it(`returns JSON 401 for unauthenticated ${path}`, async () => {
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Not authenticated" });
    });

    it(`lets a password-authed caller without a display name reach ${path}`, () => {
      const res = proxy(makeRequest(path, { "flatpare-auth": authCookie() }));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  }

  it("redirects unauthenticated /add-user to the login page", () => {
    const res = proxy(makeRequest("/add-user"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/$/);
  });

  it("lets a password-authed visitor without a name reach /add-user", () => {
    const res = proxy(makeRequest("/add-user", { "flatpare-auth": authCookie() }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy — auth cookie can't be forged", () => {
  const forged = ["true", "1", "", "yes", "a".repeat(64)];

  for (const value of forged) {
    it(`rejects a hand-set auth cookie of ${JSON.stringify(value)}`, () => {
      const res = proxy(
        makeRequest("/api/apartments", {
          "flatpare-auth": value,
          "flatpare-name": "Mallory",
        })
      );
      expect(res.status).toBe(401);
    });
  }

  it("rejects a cookie minted under a different password", () => {
    const stale = authCookie();
    process.env.APP_PASSWORD = "rotated-password";
    try {
      const res = proxy(
        makeRequest("/api/apartments", {
          "flatpare-auth": stale,
          "flatpare-name": "Alice",
        })
      );
      expect(res.status).toBe(401);
    } finally {
      process.env.APP_PASSWORD = "test-password";
    }
  });
});

describe("proxy — protected API routes", () => {
  const protectedPaths = [
    "/api/apartments",
    "/api/apartments/42",
    "/api/apartments/42/ratings",
    "/api/apartments/42/reprocess",
    "/api/apartments/check-listings",
    "/api/parse-pdf",
    "/api/parse-pdf/upload-token",
    "/api/locations",
    "/api/locations/3",
    "/api/locations/3/move",
    "/api/geocode/backfill",
    "/api/settings/recompute-distances",
    "/api/costs",
    "/api/pdf/some/file.pdf",
    "/api/uploads/some/file.bin",
  ];

  for (const path of protectedPaths) {
    it(`returns JSON 401 (not redirect) for unauthenticated ${path}`, async () => {
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: "Not authenticated" });
    });

    it(`lets authenticated calls through to ${path}`, () => {
      const res = proxy(makeRequest(path, authedCookies()));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  }

  it("returns 401 when auth cookie is set but display name is missing", async () => {
    const res = proxy(
      makeRequest("/api/apartments", { "flatpare-auth": authCookie() })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when display name is set but auth cookie is missing", async () => {
    const res = proxy(
      makeRequest("/api/apartments", { "flatpare-name": "Alice" })
    );
    expect(res.status).toBe(401);
  });
});

describe("proxy — protected page routes", () => {
  const pagePaths = [
    "/apartments",
    "/apartments/42",
    "/apartments/new",
    "/compare",
    "/costs",
    "/guide",
    "/settings",
  ];

  for (const path of pagePaths) {
    it(`redirects unauthenticated ${path} to /`, () => {
      const res = proxy(makeRequest(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toMatch(/\/$/);
    });

    it(`lets authenticated ${path} render`, () => {
      const res = proxy(makeRequest(path, authedCookies()));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  }
});

// The manifest is fetched by the browser WITHOUT credentials. If the matcher
// stops excluding it, the fetch gets a 307 to the login page, the manifest
// never parses, and the app silently stops being installable — with no error
// anywhere. Same for the icons it references.
describe("proxy — PWA assets stay public", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  const publicAssets = [
    "/manifest.webmanifest",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
    "/apple-touch-icon.png",
    "/favicon.ico",
  ];

  for (const path of publicAssets) {
    it(`does not run the proxy for ${path}`, () => {
      expect(matcher.test(path)).toBe(false);
    });
  }

  const guarded = ["/apartments", "/api/apartments", "/settings", "/compare"];
  for (const path of guarded) {
    it(`still runs the proxy for ${path}`, () => {
      expect(matcher.test(path)).toBe(true);
    });
  }
});
