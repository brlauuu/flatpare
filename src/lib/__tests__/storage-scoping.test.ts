// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { householdIdFromStoredPath } from "../storage";

describe("householdIdFromStoredPath", () => {
  it("reads the household prefix", () => {
    expect(householdIdFromStoredPath("households/7/abc.pdf")).toBe(7);
  });

  it("rejects a path with no household prefix", () => {
    expect(householdIdFromStoredPath("apartments/abc.pdf")).toBeNull();
  });

  it("rejects traversal attempts", () => {
    expect(
      householdIdFromStoredPath("households/7/../8/secret.pdf")
    ).toBeNull();
    expect(householdIdFromStoredPath("../households/8/secret.pdf")).toBeNull();
  });

  it("rejects a non-numeric household segment", () => {
    expect(householdIdFromStoredPath("households/abc/x.pdf")).toBeNull();
  });
});

const { mockRequireHousehold } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(async () => ({
    householdId: 1,
    userId: "u1",
    role: "owner" as const,
  })),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async () => ({
    statusCode: 200,
    headers: new Headers({ "content-type": "application/pdf" }),
    blob: { contentDisposition: "inline" },
    stream: new Response(new TextEncoder().encode("pdf-bytes")).body,
  })),
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    default: actual,
    readFile: vi.fn(async () => Buffer.from("disk-bytes")),
  };
});

beforeEach(() => {
  mockRequireHousehold.mockClear();
  mockRequireHousehold.mockResolvedValue({
    householdId: 1,
    userId: "u1",
    role: "owner" as const,
  });
});

describe("GET /api/pdf/[...path] — household scoping", () => {
  it("serves a file that belongs to the caller's own household", async () => {
    const { GET } = await import("@/app/api/pdf/[...path]/route");
    const res = await GET(new Request("http://localhost/api/pdf/x"), {
      params: Promise.resolve({ path: ["households", "1", "listing.pdf"] }),
    });
    expect(res.status).toBe(200);
  });

  it("404s a file belonging to another household", async () => {
    const { GET } = await import("@/app/api/pdf/[...path]/route");
    const res = await GET(new Request("http://localhost/api/pdf/x"), {
      params: Promise.resolve({ path: ["households", "2", "secret.pdf"] }),
    });
    expect(res.status).toBe(404);
  });

  it("404s a traversal attempt", async () => {
    const { GET } = await import("@/app/api/pdf/[...path]/route");
    const res = await GET(new Request("http://localhost/api/pdf/x"), {
      params: Promise.resolve({
        path: ["households", "1", "..", "2", "s.pdf"],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("404s a path with no household prefix", async () => {
    const { GET } = await import("@/app/api/pdf/[...path]/route");
    const res = await GET(new Request("http://localhost/api/pdf/x"), {
      params: Promise.resolve({ path: ["apartments", "s.pdf"] }),
    });
    expect(res.status).toBe(404);
  });

  it("401s when there is no session", async () => {
    mockRequireHousehold.mockRejectedValueOnce(new Error("no session"));
    const { GET } = await import("@/app/api/pdf/[...path]/route");
    const res = await GET(new Request("http://localhost/api/pdf/x"), {
      params: Promise.resolve({ path: ["households", "1", "listing.pdf"] }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/uploads/[...path] — household scoping", () => {
  it("serves a file that belongs to the caller's own household", async () => {
    const { GET } = await import("@/app/api/uploads/[...path]/route");
    const res = await GET(new Request("http://localhost/api/uploads/x"), {
      params: Promise.resolve({ path: ["households", "1", "listing.pdf"] }),
    });
    expect(res.status).toBe(200);
  });

  it("404s a file belonging to another household", async () => {
    const { GET } = await import("@/app/api/uploads/[...path]/route");
    const res = await GET(new Request("http://localhost/api/uploads/x"), {
      params: Promise.resolve({ path: ["households", "2", "secret.pdf"] }),
    });
    expect(res.status).toBe(404);
  });

  it("404s a traversal attempt", async () => {
    const { GET } = await import("@/app/api/uploads/[...path]/route");
    const res = await GET(new Request("http://localhost/api/uploads/x"), {
      params: Promise.resolve({
        path: ["households", "1", "..", "2", "s.pdf"],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("404s a path with no household prefix", async () => {
    const { GET } = await import("@/app/api/uploads/[...path]/route");
    const res = await GET(new Request("http://localhost/api/uploads/x"), {
      params: Promise.resolve({ path: ["apartments", "s.pdf"] }),
    });
    expect(res.status).toBe(404);
  });

  it("401s when there is no session", async () => {
    mockRequireHousehold.mockRejectedValueOnce(new Error("no session"));
    const { GET } = await import("@/app/api/uploads/[...path]/route");
    const res = await GET(new Request("http://localhost/api/uploads/x"), {
      params: Promise.resolve({ path: ["households", "1", "listing.pdf"] }),
    });
    expect(res.status).toBe(401);
  });
});
