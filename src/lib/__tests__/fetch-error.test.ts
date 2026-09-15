import { describe, it, expect } from "vitest";
import {
  serializeErrorDetails,
  errorDetailsFromException,
} from "@/lib/fetch-error";

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

describe("errorDetailsFromException", () => {
  it("captures message and stack, and a numeric status when the error carries one", () => {
    const err = Object.assign(new Error("Stale version"), { status: 409 });
    const d = errorDetailsFromException(err);
    expect(d.message).toBe("Stale version");
    expect(d.status).toBe(409);
    expect(d.stack).toContain("Stale version");
    expect(d.url).toBeUndefined();
    expect(typeof d.timestamp).toBe("string");
  });

  it("leaves status undefined for a plain Error and stringifies non-Errors", () => {
    expect(errorDetailsFromException(new Error("x")).status).toBeUndefined();
    expect(errorDetailsFromException("boom").message).toBe("boom");
  });
});
