/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Three lines, but not nothing: src/proxy.ts allow-lists /api/auth/* wholesale
// on the understanding that Auth.js owns the whole namespace. If this file
// ever exported only GET, or wrapped a handler, sign-in would break with a
// 405 that looks like a routing bug rather than a missing export.

const ORIGINAL = {
  secret: process.env.AUTH_SECRET,
  password: process.env.APP_PASSWORD,
  trust: process.env.AUTH_TRUST_HOST,
};

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-not-for-real-use-000000000000";
  process.env.APP_PASSWORD = "secret123";
  process.env.AUTH_TRUST_HOST = "true";
});

afterAll(() => {
  for (const [k, v] of [
    ["AUTH_SECRET", ORIGINAL.secret],
    ["APP_PASSWORD", ORIGINAL.password],
    ["AUTH_TRUST_HOST", ORIGINAL.trust],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("/api/auth/[...nextauth]", () => {
  it("re-exports both of Auth.js's handlers, unwrapped", async () => {
    const route = await import("../[...nextauth]/route");
    const { handlers } = await import("@/auth");

    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    // Identity, not just presence: a wrapper here would silently change what
    // Auth.js sees of the request.
    expect(route.GET).toBe(handlers.GET);
    expect(route.POST).toBe(handlers.POST);
  });
});
