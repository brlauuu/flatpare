import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// auth.ts reads process.env once at module load (to decide which providers
// to register), so every case needs a fresh module instance via
// vi.resetModules() + a dynamic import *after* the env is set — a static
// top-level import would only ever exercise whichever env was live first.
const OAUTH_VARS = ["GOOGLE_CLIENT_ID", "GITHUB_CLIENT_ID"] as const;

beforeEach(() => {
  vi.resetModules();
  for (const v of OAUTH_VARS) delete process.env[v];
  process.env.APP_PASSWORD = "secret123";
  process.env.AUTH_SECRET = "test-secret-not-for-real-use-000000000000";
  process.env.AUTH_TRUST_HOST = "true";
});

afterEach(() => {
  for (const v of OAUTH_VARS) delete process.env[v];
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_TRUST_HOST;
});

async function registeredProviderIds(): Promise<string[]> {
  const { handlers } = await import("@/auth");
  const res = await handlers.GET(
    new NextRequest("http://localhost/api/auth/providers")
  );
  const body = (await res.json()) as Record<string, unknown>;
  return Object.keys(body);
}

describe("Auth.js provider registration", () => {
  it("registers only the credentials provider when no OAuth env vars are set", async () => {
    const ids = await registeredProviderIds();
    expect(ids).toContain("credentials");
    expect(ids).not.toContain("google");
    expect(ids).not.toContain("github");
  });

  it("registers google and drops the credentials backdoor when GOOGLE_CLIENT_ID is set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    const ids = await registeredProviderIds();
    expect(ids).toContain("google");
    expect(ids).not.toContain("credentials");
  });

  it("registers github and drops the credentials backdoor when GITHUB_CLIENT_ID is set", async () => {
    process.env.GITHUB_CLIENT_ID = "test-github-client-id";
    const ids = await registeredProviderIds();
    expect(ids).toContain("github");
    expect(ids).not.toContain("credentials");
  });

  it("registers both OAuth providers and drops the credentials backdoor when both are set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GITHUB_CLIENT_ID = "test-github-client-id";
    const ids = await registeredProviderIds();
    expect(ids).toContain("google");
    expect(ids).toContain("github");
    expect(ids).not.toContain("credentials");
  });
});
