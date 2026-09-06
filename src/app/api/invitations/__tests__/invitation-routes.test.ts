import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, invitations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

const authUser = { id: "" as string | null };
const unstableUpdate = vi.fn(async () => null);
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (authUser.id ? { user: { id: authUser.id } } : null)),
  unstable_update: (...args: unknown[]) => unstableUpdate(...(args as [])),
}));

import { GET as listGET, POST as createPOST } from "../route";
import { DELETE as revokeDELETE } from "../[id]/route";
import { GET as mineGET } from "../mine/route";
import { POST as acceptPOST } from "../[id]/accept/route";
import { POST as declinePOST } from "../decline/route";

function json(body: unknown, method = "POST") {
  return new Request("http://localhost/api/invitations", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let hid: number;

beforeEach(async () => {
  unstableUpdate.mockClear();
  await db.delete(invitations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m", "ana"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
  authUser.id = "ana";
});

describe("GET/POST /api/invitations", () => {
  it("owner creates and lists invitations", async () => {
    const created = await createPOST(json({ email: "Ana@Example.com" }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.email).toBe("ana@example.com");

    const list = await listGET();
    expect(list.status).toBe(200);
    const { invitations: rows } = await list.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: body.id, email: "ana@example.com" });
  });

  it("a member (by database role) gets 403 even if the token says owner", async () => {
    currentSession.userId = "m";
    currentSession.role = "owner";
    expect((await createPOST(json({ email: "x@example.com" }))).status).toBe(403);
    expect((await listGET()).status).toBe(403);
  });

  it("400 on a bad email, 409 on a duplicate", async () => {
    expect((await createPOST(json({ email: "nope" }))).status).toBe(400);
    await createPOST(json({ email: "ana@example.com" }));
    expect((await createPOST(json({ email: "ana@example.com" }))).status).toBe(409);
  });
});

describe("DELETE /api/invitations/[id]", () => {
  it("owner revokes; unknown id is 404", async () => {
    const created = await (await createPOST(json({ email: "ana@example.com" }))).json();
    const res = await revokeDELETE(new Request("http://localhost"), params(String(created.id)));
    expect(res.status).toBe(204);
    expect((await (await listGET()).json()).invitations).toHaveLength(0);
    const missing = await revokeDELETE(new Request("http://localhost"), params("999999"));
    expect(missing.status).toBe(404);
    const bad = await revokeDELETE(new Request("http://localhost"), params("abc"));
    expect(bad.status).toBe(400);
  });
});

describe("GET /api/invitations/mine", () => {
  it("lists invitations addressed to the signed-in user's email", async () => {
    await createPOST(json({ email: "ana@example.com" }));
    const res = await mineGET();
    expect(res.status).toBe(200);
    const { invitations: rows } = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].householdName).toBe("H");
    expect(rows[0].invitedByName).toBe("o");
  });

  it("401 without a session", async () => {
    authUser.id = null;
    expect((await mineGET()).status).toBe(401);
  });
});

describe("POST /api/invitations/[id]/accept and /decline", () => {
  it("accept joins the household and refreshes the session cookie", async () => {
    const created = await (await createPOST(json({ email: "ana@example.com" }))).json();
    const res = await acceptPOST(new Request("http://localhost", { method: "POST" }), params(String(created.id)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ householdId: hid });
    expect(unstableUpdate).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(householdMembers).where(eq(householdMembers.userId, "ana"));
    expect(row.householdId).toBe(hid);
  });

  it("accept with a mismatched email is 403 and does not refresh", async () => {
    const created = await (await createPOST(json({ email: "someone-else@example.com" }))).json();
    const res = await acceptPOST(new Request("http://localhost", { method: "POST" }), params(String(created.id)));
    expect(res.status).toBe(403);
    expect(unstableUpdate).not.toHaveBeenCalled();
  });

  it("decline starts an own household and refreshes the session cookie", async () => {
    const res = await declinePOST();
    expect(res.status).toBe(200);
    const { householdId } = await res.json();
    expect(typeof householdId).toBe("number");
    expect(householdId).not.toBe(hid);
    expect(unstableUpdate).toHaveBeenCalledTimes(1);
  });

  it("decline when already in a household is 409", async () => {
    authUser.id = "m";
    expect((await declinePOST()).status).toBe(409);
  });
});
