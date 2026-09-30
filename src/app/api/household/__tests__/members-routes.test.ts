import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, householdKeyWraps } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));
const unstableUpdate = vi.fn(async () => null);
vi.mock("@/auth", () => ({
  unstable_update: (...args: unknown[]) => unstableUpdate(...(args as [])),
}));

import { GET as membersGET } from "../members/route";
import { DELETE as memberDELETE } from "../members/[userId]/route";
import { POST as leavePOST } from "../leave/route";

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });
let hid: number;

beforeEach(async () => {
  unstableUpdate.mockClear();
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
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailed: "off" });
    const body = await (await membersGET()).json();
    expect(body.members.map((m: { userId: string }) => m.userId)).toEqual(["o"]);
  });

  describe("removal email (#298)", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "e_1" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      vi.stubEnv("RESEND_API_KEY", "re_test");
      vi.stubEnv("EMAIL_FROM", "Flatpare <hello@flatpare.com>");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("tells the removed member who removed them, and nothing about the household", async () => {
      await db.update(households).set({ name: "Secret Household Name" });
      const res = await memberDELETE(new Request("http://localhost"), params("m"));
      expect(await res.json()).toEqual({ emailed: "sent" });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const mail = JSON.parse(String(init.body));
      expect(mail.to).toEqual(["m@example.com"]);
      expect(mail.text).toContain("o removed you");
      expect(JSON.stringify(mail)).not.toContain("Secret Household Name");
    });

    it("keeps the removal when the email fails", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
      const res = await memberDELETE(new Request("http://localhost"), params("m"));
      expect(await res.json()).toEqual({ emailed: "failed" });
      const body = await (await membersGET()).json();
      expect(body.members.map((m: { userId: string }) => m.userId)).toEqual(["o"]);
    });

    it("sends nothing when the removal is refused", async () => {
      currentSession.userId = "m";
      expect((await memberDELETE(new Request("http://localhost"), params("o"))).status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("member cannot remove (403); owner cannot remove self (400); unknown is 404", async () => {
    currentSession.userId = "m";
    expect((await memberDELETE(new Request("http://localhost"), params("o"))).status).toBe(403);
    currentSession.userId = "o";
    expect((await memberDELETE(new Request("http://localhost"), params("o"))).status).toBe(400);
    expect((await memberDELETE(new Request("http://localhost"), params("zzz"))).status).toBe(404);
  });
});

// #220
describe("POST /api/household/leave", () => {
  it("lets a member leave and refreshes the session", async () => {
    currentSession.userId = "m";
    currentSession.role = "member";
    const res = await leavePOST();
    expect(res.status).toBe(200);
    expect(unstableUpdate).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(householdMembers);
    expect(rows.map((r) => r.userId)).toEqual(["o"]);
    const [h] = await db.select({ due: households.rotationDue }).from(households);
    expect(h.due).toBe(true);
  });

  it("refuses the owner with 400 and does not touch the session", async () => {
    const res = await leavePOST();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/owner cannot leave/);
    expect(unstableUpdate).not.toHaveBeenCalled();
    expect(await db.select().from(householdMembers)).toHaveLength(2);
  });
});
