import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { z } from "zod";
import { ApiError } from "../api-error";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "../api-route";
import { ForbiddenError, UnauthorizedError } from "../household";

const sessionState = vi.hoisted(() => ({
  current: { householdId: 1, userId: "u1", role: "owner" as const },
  member: true,
}));
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...sessionState.current })),
}));
vi.mock("@/lib/household", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/household")>();
  return {
    ...actual,
    assertMembership: vi.fn(async () => {
      if (!sessionState.member) throw new actual.ForbiddenError();
      return "owner";
    }),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("apiErrorResponse", () => {
  it("maps UnauthorizedError to 401", async () => {
    const res = apiErrorResponse(new UnauthorizedError(), "t");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("maps ForbiddenError to 403", async () => {
    const res = apiErrorResponse(new ForbiddenError(), "t");
    expect(res.status).toBe(403);
  });

  it("maps ApiError to its own status and message", async () => {
    const res = apiErrorResponse(new ApiError("Keys already exist", 409), "t");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Keys already exist" });
  });

  it("maps a ZodError to 400 with issues", async () => {
    const parsed = z.object({ a: z.string() }).safeParse({ a: 1 });
    if (parsed.success) throw new Error("expected failure");
    const res = apiErrorResponse(parsed.error, "t");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request body");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("logs and returns 500 for anything else", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = apiErrorResponse(new Error("boom"), "crypto:setup");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
    expect(spy).toHaveBeenCalledWith("[crypto:setup]", expect.any(Error));
  });
});

describe("parseBody", () => {
  const schema = z.object({ name: z.string() });

  it("returns the parsed body", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "a" }),
    });
    expect(await parseBody(req, schema)).toEqual({ name: "a" });
  });

  it("throws ApiError 400 on invalid JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: "{not json" });
    await expect(parseBody(req, schema)).rejects.toMatchObject({ status: 400 });
  });

  it("throws a ZodError on a schema mismatch", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: 3 }),
    });
    await expect(parseBody(req, schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("requireEncryptionOn", () => {
  it("passes when encryption is on", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "on");
    expect(() => requireEncryptionOn()).not.toThrow();
  });

  it("throws ApiError 409 when encryption is off", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    expect(() => requireEncryptionOn()).toThrow(ApiError);
    try {
      requireEncryptionOn();
    } catch (e) {
      expect((e as ApiError).status).toBe(409);
    }
  });
});

import { isUniqueConstraintError, requireEnvelopeMode, requireMember } from "@/lib/api-route";

describe("requireMember", () => {
  beforeEach(() => {
    sessionState.member = true;
  });

  it("returns the session when the database confirms membership", async () => {
    await expect(requireMember()).resolves.toEqual({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
  });

  it("answers 404, not 403, for a removed member with a still-valid token", async () => {
    sessionState.member = false;
    const err = await requireMember().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
  });
});

describe("requireEnvelopeMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the envelope version matching the deployment mode", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "on");
    expect(() => requireEnvelopeMode({ v: 1, iv: "AA==", ct: "AA==" })).not.toThrow();
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    expect(() => requireEnvelopeMode({ v: 0, data: {} })).not.toThrow();
  });

  it("rejects a plaintext envelope under encryption on with 400", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "on");
    const err = (() => {
      try {
        requireEnvelopeMode({ v: 0, data: {} });
      } catch (e) {
        return e as ApiError;
      }
    })();
    expect(err).toBeInstanceOf(ApiError);
    expect(err?.status).toBe(400);
    expect(err?.message).toBe("Plaintext envelope in an encrypted deployment");
  });

  it("rejects an encrypted envelope under encryption off with 400", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    expect(() => requireEnvelopeMode({ v: 1, iv: "AA==", ct: "AA==" })).toThrow(
      "Encrypted envelope in a deployment with encryption off"
    );
  });
});

describe("isUniqueConstraintError", () => {
  it("matches libsql's unique-constraint message", () => {
    expect(isUniqueConstraintError(new Error("UNIQUE constraint failed: apartments.id"))).toBe(true);
    expect(isUniqueConstraintError(new Error("no such table"))).toBe(false);
    expect(isUniqueConstraintError("nope")).toBe(false);
  });

  it("finds the constraint message on a wrapped error's .cause", () => {
    // Mirrors DrizzleQueryError: its own .message is just the failed
    // query text, with the driver's constraint error one level down.
    const driverError = new Error("UNIQUE constraint failed: apartments.id");
    const wrapped = new Error("Failed query: insert into apartments ...", { cause: driverError });
    expect(isUniqueConstraintError(wrapped)).toBe(true);
  });

  it("finds the constraint message two levels down the cause chain", () => {
    const driverError = new Error("UNIQUE constraint failed: apartments.id");
    const middle = new Error("wrapped once", { cause: driverError });
    const outer = new Error("wrapped twice", { cause: middle });
    expect(isUniqueConstraintError(outer)).toBe(true);
  });

  it("returns false when no error in the chain names a constraint", () => {
    const inner = new Error("connection reset");
    const outer = new Error("Failed query: select ...", { cause: inner });
    expect(isUniqueConstraintError(outer)).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isUniqueConstraintError("nope")).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
    expect(isUniqueConstraintError({ message: "UNIQUE constraint failed" })).toBe(false);
  });

  it("does not hang on a self-referencing .cause chain", () => {
    const cyclic = new Error("wraps itself");
    cyclic.cause = cyclic;
    expect(isUniqueConstraintError(cyclic)).toBe(false);
  });
});
