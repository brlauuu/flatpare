import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireHousehold } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
}));

import { get } from "@vercel/blob";
import { GET } from "../[...path]/route";

const mockGet = vi.mocked(get);

beforeEach(() => {
  mockRequireHousehold.mockReset();
  mockGet.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(params: string[]) {
  return {
    request: new Request("http://localhost/api/pdf/" + params.join("/")),
    ctx: { params: Promise.resolve({ path: params }) },
  };
}

describe("GET /api/pdf/[...path]", () => {
  it("returns 401 when there is no session", async () => {
    mockRequireHousehold.mockRejectedValue(new Error("no session"));
    const { request, ctx } = makeRequest(["households", "1", "file.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("calls get() with access: 'private' and the joined pathname for the caller's own household", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start: (c) => c.close() }),
      headers: new Headers({ "content-type": "application/pdf" }),
      blob: { contentDisposition: "inline" },
    } as never);
    const { request, ctx } = makeRequest([
      "households",
      "1",
      "nested",
      "file.pdf",
    ]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith("households/1/nested/file.pdf", {
      access: "private",
    });
  });

  it("returns 404 when the blob is not found, for the caller's own household", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    mockGet.mockResolvedValue(null);
    const { request, ctx } = makeRequest(["households", "1", "missing.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404, not 403, for a path belonging to another household", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const { request, ctx } = makeRequest([
      "households",
      "2",
      "secret.pdf",
    ]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns 404 for a path with no household prefix", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const { request, ctx } = makeRequest(["apartments", "file.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns 404 for a traversal attempt", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const { request, ctx } = makeRequest([
      "households",
      "1",
      "..",
      "2",
      "secret.pdf",
    ]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  // Regression for the double-encoding bypass (Task 4b, fix round 1):
  // Next.js decodes each catch-all segment exactly once (decodeURIComponent)
  // before calling this route, so a segment array here already reflects
  // that single decode. A raw URL segment of "%252e%252e" arrives here as
  // "%2e%2e" (%25 -> "%", the rest untouched) — it looks like an inert
  // filename to a check written against it, but @vercel/blob's get()
  // decodes AGAIN when it builds a fetch() URL, collapsing it to ".." and
  // resolving into household 2. Same for "%252E%252E" and a triple-encoded
  // variant ("%25252e%25252e" -> one Next decode -> "%252e%252e"). Each
  // must 404 with get() never called — the fix rejects any segment that
  // still carries a "%" after Next's one decode, closing the gap
  // structurally instead of adding a second decode pass of our own.
  const doubleEncodedVectors: Array<[string, string]> = [
    ["%252e%252e", "%2e%2e"],
    ["%252E%252E", "%2E%2E"],
    ["%25252e%25252e", "%252e%252e"],
  ];

  for (const [raw, postNextDecode] of doubleEncodedVectors) {
    it(`returns 404 for the double/triple-encoded traversal vector ${JSON.stringify(raw)}`, async () => {
      mockRequireHousehold.mockResolvedValue({
        householdId: 1,
        userId: "u1",
        role: "owner",
      });
      const { request, ctx } = makeRequest([
        "households",
        "1",
        postNextDecode,
        "2",
        "secret.pdf",
      ]);
      const res = await GET(request, ctx);
      expect(res.status).toBe(404);
      expect(mockGet).not.toHaveBeenCalled();
    });
  }

  // The fix must not widen the net: ordinary filenames that merely
  // contain characters Next had to percent-decode (a space, an accented
  // letter) carry no "%" once decoded, and must keep reading back fine.
  it("still reads back a filename containing a space", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start: (c) => c.close() }),
      headers: new Headers({ "content-type": "application/pdf" }),
      blob: { contentDisposition: "inline" },
    } as never);
    const { request, ctx } = makeRequest([
      "households",
      "1",
      "my listing.pdf",
    ]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith("households/1/my listing.pdf", {
      access: "private",
    });
  });

  it("still reads back a filename containing a non-ASCII character", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start: (c) => c.close() }),
      headers: new Headers({ "content-type": "application/pdf" }),
      blob: { contentDisposition: "inline" },
    } as never);
    const { request, ctx } = makeRequest(["households", "1", "café.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith("households/1/café.pdf", {
      access: "private",
    });
  });
});
