import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockHandleUpload, mockRequireHousehold } = vi.hoisted(() => ({
  mockHandleUpload: vi.fn(),
  mockRequireHousehold: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: mockHandleUpload,
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

import { UnauthorizedError } from "@/lib/household";
import { GET, POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireHousehold.mockResolvedValue({
    householdId: 7,
    userId: "u1",
    role: "owner",
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/parse-pdf/upload-token", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireHousehold.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when blob storage is not configured", async () => {
    const res = await GET();
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.enabled).toBe(false);
  });

  it("returns 200 when BLOB_READ_WRITE_TOKEN is set", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.enabled).toBe(true);
  });
});

describe("POST /api/parse-pdf/upload-token", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireHousehold.mockRejectedValueOnce(new UnauthorizedError());
    const req = new Request("http://localhost/api/parse-pdf/upload-token", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockHandleUpload).not.toHaveBeenCalled();
  });

  it("returns 503 when blob storage is not configured", async () => {
    const req = new Request("http://localhost/api/parse-pdf/upload-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(mockHandleUpload).not.toHaveBeenCalled();
  });

  it("delegates to @vercel/blob handleUpload when configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockHandleUpload.mockResolvedValueOnce({
      type: "blob.generate-client-token",
      clientToken: "tok_123",
    });

    const req = new Request("http://localhost/api/parse-pdf/upload-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.clientToken).toBe("tok_123");
    expect(mockHandleUpload).toHaveBeenCalledTimes(1);

    const opts = mockHandleUpload.mock.calls[0][0];
    const tokenOpts = await opts.onBeforeGenerateToken("apartments/x.pdf", null, false);
    expect(tokenOpts.allowedContentTypes).toEqual(["application/pdf"]);
    expect(tokenOpts.maximumSizeInBytes).toBe(50 * 1024 * 1024);
  });
});
