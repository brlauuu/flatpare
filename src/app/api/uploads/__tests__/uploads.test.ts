import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireHousehold } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

import { GET } from "../[...path]/route";

beforeEach(() => {
  mockRequireHousehold.mockReset();
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
  it("returns 401 when there is no session", async () => {
    mockRequireHousehold.mockRejectedValue(new Error("no session"));
    const { request, ctx } = makeRequest(["households", "1", "file.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404, not 403, for a path belonging to another household", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const { request, ctx } = makeRequest(["households", "2", "secret.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
  });

  it("rejects path traversal attempts with 404 for authed users", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const { request, ctx } = makeRequest([
      "households",
      "1",
      "..",
      "..",
      "etc",
      "passwd",
    ]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a path with no household prefix", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const { request, ctx } = makeRequest(["file.pdf"]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 for authed users in their own household when the file is missing", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const { request, ctx } = makeRequest([
      "households",
      "1",
      "definitely-not-there-" + Date.now() + ".pdf",
    ]);
    const res = await GET(request, ctx);
    expect(res.status).toBe(404);
  });
});
