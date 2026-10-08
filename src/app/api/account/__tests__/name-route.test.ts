import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const currentSession = { householdId: 1, userId: "me", role: "member" as "owner" | "member" };
let signedIn = true;
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

import { PUT } from "../name/route";

const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/account/name", { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) }));
const nameOf = async (id: string) => (await db.select({ name: users.name }).from(users).where(eq(users.id, id)))[0]?.name;

let logged: string[];
beforeEach(async () => {
  signedIn = true;
  await db.delete(users);
  await db.insert(users).values({ id: "me", email: "me@example.com", name: "Old" });
  await db.insert(users).values({ id: "other", email: "other@example.com", name: "Other" });
  logged = [];
  for (const channel of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" "));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe("PUT /api/account/name", () => {
  it("sets the caller's own name, normalised, and returns what is shown", async () => {
    const res = await put({ name: "  Lena   Muster " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Lena Muster", displayName: "Lena Muster" });
    expect(await nameOf("me")).toBe("Lena Muster");
    expect(await nameOf("other")).toBe("Other");
  });

  it("clears the name, which brings back the email", async () => {
    const res = await put({ name: "" });
    expect(await res.json()).toEqual({ name: null, displayName: "me@example.com" });
    expect(await nameOf("me")).toBeNull();
  });

  it("refuses a control character with a fixed message and changes nothing", async () => {
    const res = await put({ name: "secret\nBcc: x@example.com" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(await nameOf("me")).toBe("Old");
  });

  it("refuses a name that is too long", async () => {
    expect((await put({ name: "a".repeat(61) })).status).toBe(400);
  });

  it("refuses a body that is not JSON or has no name", async () => {
    expect((await put("not json")).status).toBe(400);
    expect((await put({})).status).toBe(400);
  });

  it("is 401 without a session", async () => {
    signedIn = false;
    expect((await put({ name: "Lena" })).status).toBe(401);
  });

  it("never logs the name, even when the write fails", async () => {
    vi.spyOn(db, "update").mockImplementation(() => {
      throw new Error("write failed for secret-name");
    });
    const res = await put({ name: "secret-name" });
    expect(res.status).toBe(500);
    expect(logged.join("\n")).not.toContain("secret-name");
  });
});
