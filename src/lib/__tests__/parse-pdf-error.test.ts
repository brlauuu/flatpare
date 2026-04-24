import { describe, it, expect } from "vitest";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";

describe("classifyParsePdfError", () => {
  it("classifies an error with status 429 as quota", () => {
    const err = Object.assign(new Error("Rate limited"), {
      status: 429,
      statusCode: 429,
    });
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.status).toBe(429);
  });

  it("parses 'retry after 34 seconds' from the message", () => {
    const err = new Error(
      "You exceeded your current quota, please retry after 34 seconds"
    );
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.retryAfterSeconds).toBe(34);
    expect(result.message).toContain("34s");
  });

  it("parses 'retry in 2m' as 120 seconds", () => {
    const err = new Error("Rate limit exceeded. Please retry in 2m.");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.retryAfterSeconds).toBe(120);
    expect(result.message).toMatch(/2m/);
  });

  it("classifies a quota message with no numeric hint and leaves retryAfter undefined", () => {
    const err = new Error("Quota exceeded for this project.");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(result.message).toMatch(/shortly/i);
  });

  it("classifies 'Invalid PDF structure' as invalid_pdf", () => {
    const err = new Error("Invalid PDF structure");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("invalid_pdf");
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/couldn't read|corrupted|unsupported/i);
  });

  it("classifies 'Token limit exceeded' as invalid_pdf", () => {
    const err = new Error("Token limit exceeded for this request");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("invalid_pdf");
  });

  it("classifies 'ECONNRESET' as unknown with status 500", () => {
    const err = new Error("ECONNRESET");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("unknown");
    expect(result.status).toBe(500);
    expect(result.message).toMatch(/ECONNRESET/);
  });

  it("falls back to a generic message for an Error with no message", () => {
    const err = new Error();
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("unknown");
    expect(result.message).toBe("Parsing failed.");
  });
});
