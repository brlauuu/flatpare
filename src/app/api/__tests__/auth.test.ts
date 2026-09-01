import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock auth lib
vi.mock("@/lib/auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    verifyPassword: vi.fn(),
    setAuthenticated: vi.fn(async () => {}),
    setDisplayName: vi.fn(async () => {}),
    isAuthenticated: vi.fn(async () => true),
    unauthorized: vi.fn(() =>
      NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    ),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// Mock db
const usersSelectRows: { name: string }[] = [];
let lastInsertValues: Record<string, unknown> | null = null;

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue(usersSelectRows),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        lastInsertValues = v;
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { name: "name", createdAt: "created_at" },
  ratings: { userName: "user_name" },
}));

vi.mock("drizzle-orm", () => ({
  asc: vi.fn((c) => c),
  desc: vi.fn((c) => c),
  eq: vi.fn(),
  ne: vi.fn(),
  avg: vi.fn(),
}));

import { POST as authPost } from "../../api/auth/route";
import { POST as namePost } from "../../api/auth/name/route";
import { GET as usersGet } from "../../api/auth/users/route";
import { DELETE as userDelete } from "../../api/auth/users/[name]/route";
import { verifyPassword, isAuthenticated } from "@/lib/auth";

const mockedVerifyPassword = vi.mocked(verifyPassword);
const mockedIsAuthenticated = vi.mocked(isAuthenticated);

beforeEach(() => {
  vi.clearAllMocks();
  mockedIsAuthenticated.mockResolvedValue(true);
  usersSelectRows.length = 0;
  lastInsertValues = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth", () => {
  it("returns success for valid password", async () => {
    mockedVerifyPassword.mockReturnValue(true);

    const req = new Request("http://localhost/api/auth", {
      method: "POST",
      body: JSON.stringify({ password: "correct" }),
    });

    const res = await authPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 401 for invalid password", async () => {
    mockedVerifyPassword.mockReturnValue(false);

    const req = new Request("http://localhost/api/auth", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
    });

    const res = await authPost(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid password");
  });
});

describe("POST /api/auth/name", () => {
  it("returns success and upserts the user", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "Alice" }),
    });

    const res = await namePost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(lastInsertValues).toEqual({ name: "Alice" });
  });

  it("trims whitespace before inserting", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "  Bob  " }),
    });

    const res = await namePost(req);
    expect(res.status).toBe(200);
    expect(lastInsertValues).toEqual({ name: "Bob" });
  });

  it("returns 400 for empty display name", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "" }),
    });

    const res = await namePost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for whitespace-only display name", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "   " }),
    });

    const res = await namePost(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/users", () => {
  it("returns list of users from the users table", async () => {
    usersSelectRows.push({ name: "Alice" }, { name: "Bob" });
    const res = await usersGet();
    const data = await res.json();
    expect(data).toEqual(["Alice", "Bob"]);
  });

  it("returns an empty list (200) when the db throws — failure is not user-facing here", async () => {
    const original = (
      await import("@/lib/db")
    ).db.select as unknown as ReturnType<typeof vi.fn>;
    original.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await usersGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
  });
});

// These three routes were reachable without the password until PR #176: the
// proxy allow-listed the whole `/api/auth` prefix. They now check for
// themselves, so they stay closed even if the gate regresses again.
describe("auth routes — defense in depth", () => {
  beforeEach(() => {
    mockedIsAuthenticated.mockResolvedValue(false);
  });

  it("POST /api/auth/name returns 401 for an unauthenticated caller", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "Mallory" }),
    });
    const res = await namePost(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("POST /api/auth/name writes nothing when unauthenticated", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "Mallory" }),
    });
    await namePost(req);
    expect(lastInsertValues).toBeNull();
  });

  it("GET /api/auth/users returns 401 for an unauthenticated caller", async () => {
    const res = await usersGet();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("GET /api/auth/users does not leak names when unauthenticated", async () => {
    usersSelectRows.push({ name: "Alice" }, { name: "Bob" });
    const res = await usersGet();
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("DELETE /api/auth/users/[name] returns 401 for an unauthenticated caller", async () => {
    const res = await userDelete(new Request("http://localhost/api/auth/users/Alice"), {
      params: Promise.resolve({ name: "Alice" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });
});
