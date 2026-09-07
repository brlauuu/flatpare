import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { apartments, households, householdMembers, ratings } from "@/lib/db/schema";
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

import { GET as listGET } from "../route";
import { PUT as ratePUT, DELETE as unrateDELETE } from "../../apartments/[id]/ratings/me/route";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_X = "33333333-3333-4333-8333-333333333333";
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });

function json(method: string, body?: unknown) {
  return new Request("http://localhost/api/ratings", {
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
  await db.delete(ratings);
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m", "x"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id.toUpperCase() });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  const [h2] = await db.insert(households).values({ name: "X", ownerId: "x" }).returning();
  otherHid = h2.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  await db.insert(householdMembers).values({ householdId: otherHid, userId: "x", role: "owner" });
  await db.insert(apartments).values({ id: ID_A, householdId: hid, envelope: JSON.stringify(v1("a")) });
  await db.insert(apartments).values({ id: ID_X, householdId: otherHid, envelope: JSON.stringify(v1("x")) });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

describe("PUT /api/apartments/[id]/ratings/me", () => {
  it("creates then replaces only the caller's rating", async () => {
    const first = await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ apartmentId: ID_A, userId: "o", userName: "O", envelope: v1("o1") });

    currentSession.userId = "m";
    await ratePUT(json("PUT", { envelope: v1("m1") }), params(ID_A));

    currentSession.userId = "o";
    const second = await ratePUT(json("PUT", { envelope: v1("o2") }), params(ID_A));
    expect(second.status).toBe(200);

    const rows = await db.select().from(ratings);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows.find((r) => r.userId === "o")!.envelope)).toEqual(v1("o2"));
    expect(JSON.parse(rows.find((r) => r.userId === "m")!.envelope)).toEqual(v1("m1"));
  });

  it("404s an apartment of another household", async () => {
    const res = await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_X));
    expect(res.status).toBe(404);
    expect(await db.select().from(ratings)).toHaveLength(0);
  });

  it("400s a plaintext envelope under encryption on", async () => {
    const res = await ratePUT(json("PUT", { envelope: { v: 0, data: {} } }), params(ID_A));
    expect(res.status).toBe(400);
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A))).status).toBe(401);
  });
});

describe("GET /api/ratings", () => {
  it("returns the household's ratings with rater names", async () => {
    await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A));
    currentSession.userId = "m";
    await ratePUT(json("PUT", { envelope: v1("m1") }), params(ID_A));
    await db.insert(ratings).values({ householdId: otherHid, apartmentId: ID_X, userId: "x", envelope: JSON.stringify(v1("x1")) });

    const res = await listGET();
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { userId: string }) => r.userId).sort()).toEqual(["m", "o"]);
    expect(rows.find((r: { userId: string }) => r.userId === "m").userName).toBe("M");
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
  });
});

describe("DELETE /api/apartments/[id]/ratings/me", () => {
  it("removes only the caller's rating", async () => {
    await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A));
    currentSession.userId = "m";
    await ratePUT(json("PUT", { envelope: v1("m1") }), params(ID_A));
    currentSession.userId = "o";

    expect((await unrateDELETE(json("DELETE"), params(ID_A))).status).toBe(204);
    const rows = await db.select().from(ratings);
    expect(rows.map((r) => r.userId)).toEqual(["m"]);
  });

  it("is 204 when nothing was there and 404 for a foreign apartment", async () => {
    expect((await unrateDELETE(json("DELETE"), params(ID_A))).status).toBe(204);
    expect((await unrateDELETE(json("DELETE"), params(ID_X))).status).toBe(404);
  });
});
