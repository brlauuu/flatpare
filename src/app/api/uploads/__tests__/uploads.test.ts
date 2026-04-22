import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(),
}));

import { isAuthenticated } from "@/lib/auth";
import { GET } from "../[...path]/route";

const mockIsAuthenticated = vi.mocked(isAuthenticated);

beforeEach(() => {
  mockIsAuthenticated.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(params: string[]) {
  return {
    request: new Request("http://localhost/api/uploads/" + params.join("/")),
    ctx: { params: Promise.resolve({ path: params }) },
  };
}

describe("GET /api/uploads/[...path]", () => {
  it("returns 401 when not authenticated", async () => {
    mockIsAuthenticated.mockResolvedValue(false);
    const { request, ctx } = makeRequest(["file.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(401);
  });

  it("rejects path traversal attempts with 403 for authed users", async () => {
    mockIsAuthenticated.mockResolvedValue(true);
    const { request, ctx } = makeRequest(["..", "..", "etc", "passwd"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 for authed users when file is missing", async () => {
    mockIsAuthenticated.mockResolvedValue(true);
    const { request, ctx } = makeRequest(["definitely-not-there-" + Date.now() + ".pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
  });
});
