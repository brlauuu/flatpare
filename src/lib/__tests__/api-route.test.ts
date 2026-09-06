import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { ApiError } from "../api-error";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "../api-route";
import { ForbiddenError, UnauthorizedError } from "../household";

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
