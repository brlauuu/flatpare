import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
}));

import { isAuthenticated } from "@/lib/auth";
import { get } from "@vercel/blob";
import { GET } from "../[...path]/route";

const mockIsAuthenticated = vi.mocked(isAuthenticated);
const mockGet = vi.mocked(get);

beforeEach(() => {
  mockIsAuthenticated.mockReset();
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
  it("returns 401 when not authenticated", async () => {
    mockIsAuthenticated.mockResolvedValue(false);
    const { request, ctx } = makeRequest(["apartments", "file.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("calls get() with access: 'private' and the joined pathname", async () => {
    mockIsAuthenticated.mockResolvedValue(true);
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start: (c) => c.close() }),
      headers: new Headers({ "content-type": "application/pdf" }),
      blob: { contentDisposition: "inline" },
    } as never);
    const { request, ctx } = makeRequest(["apartments", "nested", "file.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith("apartments/nested/file.pdf", {
      access: "private",
    });
  });

  it("returns 404 when the blob is not found", async () => {
    mockIsAuthenticated.mockResolvedValue(true);
    mockGet.mockResolvedValue(null);
    const { request, ctx } = makeRequest(["apartments", "missing.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
  });
});
