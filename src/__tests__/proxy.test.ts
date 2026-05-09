import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

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

const authedCookies = {
  "flatpare-auth": "true",
  "flatpare-name": "Alice",
};

describe("proxy — login page", () => {
  it("lets an unauthenticated visitor see the login page", () => {
    const res = proxy(makeRequest("/"));
    // x-middleware-next: 1 indicates NextResponse.next()
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects an authed visitor away from the login page", () => {
    const res = proxy(makeRequest("/", authedCookies));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/apartments");
  });
});

describe("proxy — /api/auth bypass", () => {
  it("lets unauthenticated callers reach /api/auth", () => {
    const res = proxy(makeRequest("/api/auth"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets unauthenticated callers reach /api/auth/name", () => {
    const res = proxy(makeRequest("/api/auth/name"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
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
      const res = proxy(makeRequest(path, authedCookies));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  }

  it("returns 401 when auth cookie is set but display name is missing", async () => {
    const res = proxy(
      makeRequest("/api/apartments", { "flatpare-auth": "true" })
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
      const res = proxy(makeRequest(path, authedCookies));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  }
});
