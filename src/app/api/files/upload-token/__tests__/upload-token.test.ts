// @vitest-environment node
//
// The "real handleUpload" describe block below calls into
// generateClientTokenFromReadWriteToken, which refuses to run when
// `window` is defined (a server-only guard) — jsdom (this project's
// default test environment) defines `window`, so this whole file runs
// under the node environment instead.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockHandleUpload, mockRequireMember } = vi.hoisted(() => ({
  mockHandleUpload: vi.fn(),
  mockRequireMember: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: mockHandleUpload,
}));

vi.mock("@/lib/api-route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-route")>();
  return { ...actual, requireMember: mockRequireMember };
});

import { ApiError } from "@/lib/api-error";
import { UnauthorizedError } from "@/lib/household";
import { GET, POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireMember.mockResolvedValue({
    householdId: 7,
    userId: "u1",
    role: "owner",
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/files/upload-token", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireMember.mockRejectedValueOnce(new UnauthorizedError());
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
    expect(data.householdId).toBe(7);
  });

  it("returns 404 when the caller is no longer a member (removed member, still-valid JWT)", async () => {
    mockRequireMember.mockRejectedValueOnce(new ApiError("Not found", 404));
    const res = await GET();
    expect(res.status).toBe(404);
  });
});

describe("POST /api/files/upload-token", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireMember.mockRejectedValueOnce(new UnauthorizedError());
    const req = new Request("http://localhost/api/files/upload-token", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockHandleUpload).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller is no longer a member (removed member, still-valid JWT)", async () => {
    mockRequireMember.mockRejectedValueOnce(new ApiError("Not found", 404));
    const req = new Request("http://localhost/api/files/upload-token", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(mockHandleUpload).not.toHaveBeenCalled();
  });

  it("returns 503 when blob storage is not configured", async () => {
    const req = new Request("http://localhost/api/files/upload-token", {
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

    const req = new Request("http://localhost/api/files/upload-token", {
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
    const tokenOpts = await opts.onBeforeGenerateToken(
      "households/7/x.pdf",
      null,
      false
    );
    expect(tokenOpts.allowedContentTypes).toEqual(["application/octet-stream", "application/pdf"]);
    expect(tokenOpts.maximumSizeInBytes).toBe(50 * 1024 * 1024);
    expect(tokenOpts.addRandomSuffix).toBe(false);
  });

  it("onBeforeGenerateToken rejects a pathname outside the caller's household", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockHandleUpload.mockResolvedValueOnce({
      type: "blob.generate-client-token",
      clientToken: "tok_123",
    });

    const req = new Request("http://localhost/api/files/upload-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });
    await POST(req);

    const opts = mockHandleUpload.mock.calls[0][0];
    await expect(
      opts.onBeforeGenerateToken("households/2/x.pdf", null, false)
    ).rejects.toThrow();
    await expect(
      opts.onBeforeGenerateToken("apartments/x.pdf", null, false)
    ).rejects.toThrow();
    await expect(
      opts.onBeforeGenerateToken(
        "households/1/%2e%2e/2/x.pdf",
        null,
        false
      )
    ).rejects.toThrow();
  });

  // Fix round 1, IMPORTANT 1: the check validates `canonical` but
  // handleUpload signs the raw `pathname` — trusting the two are
  // equivalent would rest the safety property on an unproven assumption
  // about how the blob backend resolves a non-canonical key. This
  // pathname is a deliberately awkward case: its dot segment cancels out
  // to land back in the caller's OWN household (7), so the
  // household-ownership check alone would let it through. The
  // canonical-equality check must still refuse it, because raw !==
  // canonical.
  it("rejects a non-canonical pathname even when it resolves back to the caller's own household", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mockHandleUpload.mockResolvedValueOnce({
      type: "blob.generate-client-token",
      clientToken: "tok_123",
    });

    const req = new Request("http://localhost/api/files/upload-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });
    await POST(req);

    const opts = mockHandleUpload.mock.calls[0][0];
    await expect(
      opts.onBeforeGenerateToken("households/7/../7/x.pdf", null, false)
    ).rejects.toThrow();
  });
});

describe("POST /api/files/upload-token — real handleUpload, no mock (guard end-to-end)", () => {
  it("refuses to mint a token for another household's prefix", async () => {
    const { handleUpload: realHandleUpload } = await vi.importActual<
      typeof import("@vercel/blob/client")
    >("@vercel/blob/client");
    mockHandleUpload.mockImplementation(realHandleUpload);

    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore1234567890";
    mockRequireMember.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });

    const req = new Request("http://localhost/api/files/upload-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname: "households/2/secret.pdf",
          callbackUrl: "http://localhost/api/files/upload-token",
          clientPayload: null,
          multipart: false,
        },
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.clientToken).toBeUndefined();
  });

  it("mints a token for the caller's own household prefix", async () => {
    const { handleUpload: realHandleUpload } = await vi.importActual<
      typeof import("@vercel/blob/client")
    >("@vercel/blob/client");
    mockHandleUpload.mockImplementation(realHandleUpload);

    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore1234567890";
    mockRequireMember.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });

    const req = new Request("http://localhost/api/files/upload-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname: "households/1/listing.pdf",
          callbackUrl: "http://localhost/api/files/upload-token",
          clientPayload: null,
          multipart: false,
        },
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(typeof data.clientToken).toBe("string");
    expect(data.clientToken.startsWith("vercel_blob_client_")).toBe(true);
  });
});
