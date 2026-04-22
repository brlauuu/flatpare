import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock auth lib
vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
  setAuthenticated: vi.fn(async () => {}),
  setDisplayName: vi.fn(async () => {}),
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
import { verifyPassword } from "@/lib/auth";

const mockedVerifyPassword = vi.mocked(verifyPassword);

beforeEach(() => {
  vi.clearAllMocks();
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
});
