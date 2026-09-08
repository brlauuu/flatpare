import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, locations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

import { GET as listGET, POST as createPOST } from "../route";
import { PUT as updatePUT, DELETE as removeDELETE } from "../[id]/route";
import { POST as movePOST } from "../[id]/move/route";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });

function json(method: string, body?: unknown) {
  return new Request("http://localhost/api/locations", {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let hid: number;
let otherHid: number;

beforeEach(async () => {
  vi.stubEnv("FLATPARE_ENCRYPTION", "on");
  signedIn = true;
  await db.delete(locations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "x"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  const [h2] = await db.insert(households).values({ name: "X", ownerId: "x" }).returning();
  otherHid = h2.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: otherHid, userId: "x", role: "owner" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

describe("/api/locations", () => {
  it("401s every handler without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
    expect((await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }))).status).toBe(401);
    expect((await updatePUT(json("PUT", { envelope: v1("a") }), params(uuid(1)))).status).toBe(401);
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(401);
    expect((await movePOST(json("POST", { direction: "up" }), params(uuid(1)))).status).toBe(401);
  });

  it("creates, lists, updates, moves and deletes within the household", async () => {
    const created = await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: uuid(1), sortOrder: 0, envelope: v1("a") });
    await createPOST(json("POST", { id: uuid(2), envelope: v1("b") }));

    const updated = await updatePUT(json("PUT", { envelope: v1("a2") }), params(uuid(1)));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: uuid(1), envelope: v1("a2") });

    const moved = await movePOST(json("POST", { direction: "up" }), params(uuid(2)));
    expect(moved.status).toBe(200);
    expect((await moved.json()).map((r: { id: string }) => r.id)).toEqual([uuid(2), uuid(1)]);

    expect((await removeDELETE(json("DELETE"), params(uuid(2)))).status).toBe(204);
    const list = await listGET();
    expect((await list.json()).map((r: { id: string }) => r.id)).toEqual([uuid(1)]);
  });

  it("404s another household's location on update, delete and move", async () => {
    await db.insert(locations).values({ id: uuid(9), householdId: otherHid, sortOrder: 0, envelope: JSON.stringify(v1("x")) });
    expect((await updatePUT(json("PUT", { envelope: v1("evil") }), params(uuid(9)))).status).toBe(404);
    expect((await removeDELETE(json("DELETE"), params(uuid(9)))).status).toBe(404);
    expect((await movePOST(json("POST", { direction: "down" }), params(uuid(9)))).status).toBe(404);
    expect(await db.select().from(locations)).toHaveLength(1);
  });

  it("400s a plaintext envelope under encryption on and 409s the sixth location", async () => {
    expect((await createPOST(json("POST", { id: uuid(1), envelope: { v: 0, data: {} } }))).status).toBe(400);
    for (let i = 1; i <= 5; i++) {
      expect((await createPOST(json("POST", { id: uuid(i), envelope: v1("a") }))).status).toBe(201);
    }
    const res = await createPOST(json("POST", { id: uuid(6), envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Too many locations");
  });

  it("409s a duplicate id", async () => {
    await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    const res = await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Duplicate id");
  });

  it("returns 200 with the unchanged order when moving past an edge", async () => {
    await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    const res = await movePOST(json("POST", { direction: "up" }), params(uuid(1)));
    expect(res.status).toBe(200);
    expect((await res.json()).map((r: { id: string }) => r.id)).toEqual([uuid(1)]);
  });
});
