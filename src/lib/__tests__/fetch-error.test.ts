import { describe, it, expect } from "vitest";
import {
  fetchErrorFromResponse,
  fetchErrorFromException,
  serializeErrorDetails,
} from "@/lib/fetch-error";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain" },
  });
}

describe("fetchErrorFromResponse", () => {
  it("extracts the `error` field from a JSON body", async () => {
    const res = jsonResponse(500, { error: "database connection failed" });
    const details = await fetchErrorFromResponse(res, "/api/apartments");
    expect(details.status).toBe(500);
    expect(details.url).toBe("/api/apartments");
    expect(details.message).toBe("database connection failed");
    expect(details.timestamp).toMatch(/^\d{4}-/);
  });

  it("falls back to text body when response is not JSON", async () => {
    const res = textResponse(502, "Bad Gateway from upstream");
    const details = await fetchErrorFromResponse(res, "/api/foo");
    expect(details.status).toBe(502);
    expect(details.message).toBe("Bad Gateway from upstream");
  });

  it("falls back to statusText when there's no body", async () => {
    const res = new Response(null, { status: 404, statusText: "Not Found" });
    const details = await fetchErrorFromResponse(res, "/api/missing");
    expect(details.status).toBe(404);
    expect(details.message).toBe("Not Found");
  });

  it("ignores non-string `error` fields", async () => {
    const res = jsonResponse(500, { error: { nested: "object" } });
    const details = await fetchErrorFromResponse(res, "/api/x");
    expect(details.message).not.toBe("[object Object]");
  });

  it("truncates very long text bodies", async () => {
    const longBody = "x".repeat(2000);
    const res = textResponse(500, longBody);
    const details = await fetchErrorFromResponse(res, "/api/x");
    expect(details.message?.length).toBeLessThanOrEqual(500);
  });
});

describe("fetchErrorFromException", () => {
  it("captures message and stack from an Error", () => {
    const err = new Error("network offline");
    const details = fetchErrorFromException(err, "/api/foo");
    expect(details.url).toBe("/api/foo");
    expect(details.message).toBe("network offline");
    expect(details.stack).toContain("network offline");
  });

  it("handles non-Error throws", () => {
    const details = fetchErrorFromException("boom", "/api/foo");
    expect(details.message).toBe("boom");
    expect(details.stack).toBeUndefined();
  });
});

describe("serializeErrorDetails", () => {
  it("builds a readable multi-line block", () => {
    const text = serializeErrorDetails("Couldn't load", {
      status: 500,
      url: "/api/x",
      message: "nope",
      timestamp: "2026-04-22T10:00:00.000Z",
    });
    expect(text).toContain("Couldn't load");
    expect(text).toContain("Status: 500");
    expect(text).toContain("URL: /api/x");
    expect(text).toContain("Message: nope");
    expect(text).toContain("Time: 2026-04-22T10:00:00.000Z");
  });

  it("omits missing fields", () => {
    const text = serializeErrorDetails("Boom", {
      timestamp: "2026-04-22T10:00:00.000Z",
    });
    expect(text).not.toContain("Status:");
    expect(text).not.toContain("URL:");
    expect(text).toContain("Time:");
  });

  it("includes stack when present", () => {
    const text = serializeErrorDetails("Boom", {
      timestamp: "2026-04-22T10:00:00.000Z",
      stack: "Error: boom\n  at foo.ts:1",
    });
    expect(text).toContain("Stack:");
    expect(text).toContain("at foo.ts:1");
  });
});
