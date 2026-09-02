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
});
