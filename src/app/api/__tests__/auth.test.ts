import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The legacy shared-password endpoints. Task 6 deletes them along with the
// rest of the display-name model; this suite pins their behaviour until then,
// because `/api/auth/*` is allow-listed wholesale by the proxy (ruling R3) and
// each route's own check is the only gate in front of it.
vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
  setAuthenticated: vi.fn(async () => {}),
  setDisplayName: vi.fn(async () => {}),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

const usersSelectRows: { name: string | null }[] = [];
let lastInsertValues: Record<string, unknown> | null = null;
let lastWhere: unknown = null;

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn((w: unknown) => {
            lastWhere = w;
            return { orderBy: vi.fn().mockResolvedValue(usersSelectRows) };
          }),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        lastInsertValues = v;
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id", name: "name", email: "email" },
  householdMembers: { householdId: "household_id", userId: "user_id" },
  ratings: { userId: "user_id", householdId: "household_id" },
}));

vi.mock("drizzle-orm", () => ({
  asc: vi.fn((c) => c),
  desc: vi.fn((c) => c),
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  ne: vi.fn(),
  avg: vi.fn(),
  and: vi.fn(),
}));

const { mockRequireHousehold } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

import { UnauthorizedError } from "@/lib/household";
import { POST as authPost } from "../../api/auth/route";
import { POST as namePost } from "../../api/auth/name/route";
import { GET as usersGet } from "../../api/auth/users/route";
import { DELETE as userDelete } from "../../api/auth/users/[name]/route";
import { setDisplayName, verifyPassword } from "@/lib/auth";

const mockedVerifyPassword = vi.mocked(verifyPassword);
const mockedSetDisplayName = vi.mocked(setDisplayName);

const HOUSEHOLD_ID = 7;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireHousehold.mockResolvedValue({
    householdId: HOUSEHOLD_ID,
    userId: "u1",
    role: "owner",
  });
  usersSelectRows.length = 0;
  lastInsertValues = null;
  lastWhere = null;
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
    expect((await res.json()).success).toBe(true);
  });

  it("returns 401 for invalid password", async () => {
    mockedVerifyPassword.mockReturnValue(false);

    const req = new Request("http://localhost/api/auth", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
    });

    const res = await authPost(req);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Invalid password");
  });
});

describe("POST /api/auth/name", () => {
  it("sets the display-name cookie", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "Alice" }),
    });

    const res = await namePost(req);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mockedSetDisplayName).toHaveBeenCalledWith("Alice");
  });

  it("no longer creates a users row — identities come from Auth.js", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "Alice" }),
    });
    await namePost(req);
    expect(lastInsertValues).toBeNull();
  });

  it("trims whitespace", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "  Bob  " }),
    });

    const res = await namePost(req);
    expect(res.status).toBe(200);
    expect(mockedSetDisplayName).toHaveBeenCalledWith("Bob");
  });

  it("returns 400 for empty display name", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "" }),
    });
    expect((await namePost(req)).status).toBe(400);
  });

  it("returns 400 for whitespace-only display name", async () => {
    const req = new Request("http://localhost/api/auth/name", {
      method: "POST",
      body: JSON.stringify({ displayName: "   " }),
    });
    expect((await namePost(req)).status).toBe(400);
  });
});

describe("GET /api/auth/users", () => {
  it("returns the names of THIS household's members", async () => {
    usersSelectRows.push({ name: "Alice" }, { name: "Bob" });
    const res = await usersGet();
    expect(await res.json()).toEqual(["Alice", "Bob"]);
    // The join is filtered on the session household, not the whole users
    // table — that listing used to expose every account in the deployment.
    expect(lastWhere).toEqual({ eq: ["household_id", HOUSEHOLD_ID] });
  });

  it("drops members who have no display name yet", async () => {
    usersSelectRows.push({ name: "Alice" }, { name: null });
    const res = await usersGet();
    expect(await res.json()).toEqual(["Alice"]);
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

describe("DELETE /api/auth/users/[name]", () => {
  it("is retired: 410 and no database access", async () => {
    // It used to delete ratings and users by display name with no household
    // predicate — a cross-tenant destructive operation, and display names are
    // not unique across households. Member removal is issue #197 / E5.
    const { db } = await import("@/lib/db");
    const res = await userDelete();
    expect(res.status).toBe(410);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

// The proxy allow-lists `/api/auth/*` wholesale (ruling R3), so these routes'
// own checks are the only gate. They must stay closed on their own.
describe("auth routes — defense in depth", () => {
  beforeEach(() => {
    mockRequireHousehold.mockRejectedValue(new UnauthorizedError());
  });

  it("POST /api/auth/name returns 401 for a caller with no session", async () => {
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
    expect(mockedSetDisplayName).not.toHaveBeenCalled();
    expect(lastInsertValues).toBeNull();
  });

  it("GET /api/auth/users returns 401 and leaks no names", async () => {
    usersSelectRows.push({ name: "Alice" }, { name: "Bob" });
    const res = await usersGet();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });
});
