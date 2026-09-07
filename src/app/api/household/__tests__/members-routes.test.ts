import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, householdKeyWraps } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

import { GET as membersGET } from "../members/route";
import { DELETE as memberDELETE } from "../members/[userId]/route";

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });
let hid: number;

beforeEach(async () => {
  await db.delete(householdKeyWraps);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  await db.insert(householdKeyWraps).values({ householdId: hid, userId: "o", wrappedKey: "W", wrappedBy: "o" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

describe("GET /api/household/members", () => {
  it("lists members with wrap state and identifies the caller", async () => {
    const res = await membersGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.me).toEqual({ userId: "o", role: "owner" });
    expect(body.members).toEqual([
      { userId: "o", name: "o", email: "o@example.com", role: "owner", hasWrap: true },
      { userId: "m", name: "m", email: "m@example.com", role: "member", hasWrap: false },
    ]);
  });

  it("a member can read the list too (role comes from the database)", async () => {
    currentSession.userId = "m";
    currentSession.role = "owner";
    const body = await (await membersGET()).json();
    expect(body.me).toEqual({ userId: "m", role: "member" });
  });
});

describe("DELETE /api/household/members/[userId]", () => {
  it("owner removes a member", async () => {
    const res = await memberDELETE(new Request("http://localhost"), params("m"));
    expect(res.status).toBe(204);
    const body = await (await membersGET()).json();
    expect(body.members.map((m: { userId: string }) => m.userId)).toEqual(["o"]);
  });

  it("member cannot remove (403); owner cannot remove self (400); unknown is 404", async () => {
    currentSession.userId = "m";
    expect((await memberDELETE(new Request("http://localhost"), params("o"))).status).toBe(403);
    currentSession.userId = "o";
    expect((await memberDELETE(new Request("http://localhost"), params("o"))).status).toBe(400);
    expect((await memberDELETE(new Request("http://localhost"), params("zzz"))).status).toBe(404);
  });
});
