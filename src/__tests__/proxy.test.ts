import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "../proxy";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
const mockedAuth = vi.mocked(auth);

function signedIn() {
  mockedAuth.mockResolvedValue({
    user: { id: "u1" },
    householdId: 1,
    role: "owner",
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as never);
}

function signedOut() {
  mockedAuth.mockResolvedValue(null as never);
}

function makeRequest(path: string): NextRequest {
  const url = `http://localhost:3002${path}`;
  return new NextRequest(url);
}

describe("proxy — session gate", () => {
  it("redirects an unauthenticated page request to the login screen", async () => {
    signedOut();
    const res = await proxy(makeRequest("/apartments"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/$/);
  });

  it("returns JSON 401 for an unauthenticated API request", async () => {
    signedOut();
    const res = await proxy(makeRequest("/api/apartments"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("lets a signed-in user through", async () => {
    signedIn();
    const res = await proxy(makeRequest("/apartments"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("always allows the Auth.js endpoints", async () => {
    signedOut();
    const res = await proxy(makeRequest("/api/auth/signin"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  // Deliberate contract, per R3: the proxy passes through ANY path under
  // /api/auth/ unconditionally, signed in or not, because Auth.js owns that
  // namespace and its endpoint set is version-dependent — enumerating an
  // allow-list would be brittle and would break sign-in on an upgrade. This
  // is a *broader* pass-through than the old exact "/api/auth" match (see
  // AGENTS.md's note on PR #176, where a startsWith("/api/auth") prefix once
  // exposed user listing and deletion). Route handlers under /api/auth/*
  // must carry their own authorization — the proxy will not do it for them.
  it("passes through any /api/auth/* sub-path unconditionally, signed out or in", async () => {
    const authPaths = [
      "/api/auth/signin",
      "/api/auth/callback/google",
      "/api/auth/session",
      "/api/auth/some/arbitrary/sub-path",
    ];
    for (const path of authPaths) {
      signedOut();
      const outRes = await proxy(makeRequest(path));
      expect(outRes.headers.get("x-middleware-next")).toBe("1");

      signedIn();
      const inRes = await proxy(makeRequest(path));
      expect(inRes.headers.get("x-middleware-next")).toBe("1");
    }
  });

  // The other half of isAuthed: a session can carry a user id without a
  // household (e.g. mid-provisioning, or a bug that drops the JWT callback's
  // householdId assignment). Both branches must still fail closed.
  it("redirects a page request when the session has a user id but no householdId", async () => {
    mockedAuth.mockResolvedValue({
      user: { id: "u1" },
      householdId: undefined,
      role: "owner",
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const res = await proxy(makeRequest("/apartments"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/$/);
  });

  it("returns JSON 401 for an API request when the session has a user id but no householdId", async () => {
    mockedAuth.mockResolvedValue({
      user: { id: "u1" },
      householdId: undefined,
      role: "owner",
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const res = await proxy(makeRequest("/api/apartments"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });
});

describe("proxy — login page", () => {
  it("lets an unauthenticated visitor see the login page", async () => {
    signedOut();
    const res = await proxy(makeRequest("/"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects an authed visitor away from the login page", async () => {
    signedIn();
    const res = await proxy(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/apartments");
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
    "/api/pdf/some/file.pdf",
    "/api/uploads/some/file.bin",
  ];

  for (const path of protectedPaths) {
    it(`returns JSON 401 (not redirect) for unauthenticated ${path}`, async () => {
      signedOut();
      const res = await proxy(makeRequest(path));
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: "Not authenticated" });
    });

    it(`lets authenticated calls through to ${path}`, async () => {
      signedIn();
      const res = await proxy(makeRequest(path));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });
  }
});

describe("proxy — protected page routes", () => {
  const pagePaths = [
    "/apartments",
    "/apartments/42",
    "/apartments/new",
    "/compare",
    "/guide",
    "/settings",
  ];

  for (const path of pagePaths) {
    it(`redirects unauthenticated ${path} to /`, async () => {
      signedOut();
      const res = await proxy(makeRequest(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toMatch(/\/$/);
    });

    it(`lets authenticated ${path} render`, async () => {
      signedIn();
      const res = await proxy(makeRequest(path));
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
