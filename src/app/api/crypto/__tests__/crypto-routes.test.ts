import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...currentSession })),
}));

import { GET as statusGET } from "../status/route";
import { POST as setupPOST } from "../setup/route";
import { GET as pendingGET } from "../pending-wraps/route";
import { POST as wrapsPOST } from "../wraps/route";
import { PUT as memberKeysPUT } from "../member-keys/route";
import { POST as resetPOST } from "../member-keys/reset/route";
import { POST as recoverPOST } from "../recover/route";
import { PUT as recoveryPUT } from "../recovery/route";

const kdf = { salt: "AAAA", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 };
const member = (tag: string) => ({
  publicKey: `PUB${tag}`,
  wrappedPrivateKey: `PRIV${tag}`,
  privateKeyIv: "IVIV",
  kdf,
});
const recovery = { wrappedKey: "RECOV", iv: "RIV", kdf };

function post(body: unknown) {
  return new Request("http://localhost/api/crypto/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function as(userId: string, role: "owner" | "member", householdId: number) {
  currentSession.userId = userId;
  currentSession.role = role;
  currentSession.householdId = householdId;
}

let hid: number;

beforeEach(async () => {
  vi.stubEnv("FLATPARE_ENCRYPTION", "on");
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
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
});

afterEach(() => vi.unstubAllEnvs());

async function ownerSetup() {
  await as("o", "owner", hid);
  const res = await setupPOST(
    post({ member: member("o"), household: { wrappedKey: "WRAPO", recovery } })
  );
  expect(res.status).toBe(201);
}

describe("GET /api/crypto/status", () => {
  it("returns the mode and a fresh status", async () => {
    await as("o", "owner", hid);
    const res = await statusGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("on");
    expect(body.memberKeys).toBeNull();
    expect(body.householdHasWraps).toBe(false);
  });

  it("still answers when encryption is off", async () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    await as("o", "owner", hid);
    const res = await statusGET();
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("off");
  });

  it("401 without a session", async () => {
    await as("", "owner", hid);
    const { requireHousehold } = await import("@/lib/session");
    const { UnauthorizedError } = await import("@/lib/household");
    vi.mocked(requireHousehold).mockRejectedValueOnce(new UnauthorizedError());
    const res = await statusGET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/crypto/setup", () => {
  it("owner creates keys + household key; member creates keys only", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    const res = await setupPOST(post({ member: member("m") }));
    expect(res.status).toBe(201);
    const status = await (await statusGET()).json();
    expect(status.memberKeys.publicKey).toBe("PUBm");
    expect(status.wrap).toBeNull();
    expect(status.householdHasWraps).toBe(true);
  });

  it("400 on an invalid body", async () => {
    await as("o", "owner", hid);
    const res = await setupPOST(post({ member: { publicKey: "!!" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request body");
  });

  it("409 when encryption is off", async () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    await as("o", "owner", hid);
    const res = await setupPOST(post({ member: member("o") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Encryption is off for this deployment");
  });

  it("uses the database role, not the token's", async () => {
    // Token claims owner, DB says member → household key creation is 403.
    await as("m", "owner", hid);
    const res = await setupPOST(
      post({ member: member("m"), household: { wrappedKey: "X", recovery } })
    );
    expect(res.status).toBe(403);
  });

  it("403 when the token's household no longer contains the user", async () => {
    await db.delete(householdMembers).where(
      (await import("drizzle-orm")).eq(householdMembers.userId, "m")
    );
    await as("m", "member", hid);
    const res = await setupPOST(post({ member: member("m") }));
    expect(res.status).toBe(403);
  });
});

describe("pending-wraps + wraps", () => {
  it("lists pending members and lets a key holder fulfil them", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    await setupPOST(post({ member: member("m") }));

    await as("o", "owner", hid);
    const pending = await (await pendingGET()).json();
    expect(pending.pending).toEqual([
      { userId: "m", name: "m", email: "m@example.com", publicKey: "PUBm" },
    ]);

    const res = await wrapsPOST(post({ wraps: [{ userId: "m", wrappedKey: "WRAPM" }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fulfilled: 1 });

    await as("m", "member", hid);
    expect((await (await statusGET()).json()).wrap).toBe("WRAPM");
  });

  it("403 when the caller holds no wrap", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    await setupPOST(post({ member: member("m") }));
    const res = await wrapsPOST(post({ wraps: [{ userId: "m", wrappedKey: "X" }] }));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/crypto/member-keys and reset", () => {
  it("replaces the wrapped private key", async () => {
    await ownerSetup();
    const res = await memberKeysPUT(
      new Request("http://localhost/api/crypto/member-keys", {
        method: "PUT",
        body: JSON.stringify({ wrappedPrivateKey: "P2", privateKeyIv: "I2", kdf }),
      })
    );
    expect(res.status).toBe(200);
    expect((await (await statusGET()).json()).memberKeys.wrappedPrivateKey).toBe("P2");
  });

  it("reset installs a new keypair and drops the wrap", async () => {
    await ownerSetup();
    const res = await resetPOST(post(member("o2")));
    expect(res.status).toBe(200);
    const status = await (await statusGET()).json();
    expect(status.memberKeys.publicKey).toBe("PUBo2");
    expect(status.wrap).toBeNull();
  });
});

describe("recover + recovery", () => {
  it("recover reinstalls keys, wrap, and kit", async () => {
    await ownerSetup();
    const res = await recoverPOST(
      post({
        member: member("o3"),
        wrappedKey: "WRAPO3",
        recovery: { wrappedKey: "R2", iv: "I2", kdf },
      })
    );
    expect(res.status).toBe(200);
    const status = await (await statusGET()).json();
    expect(status.memberKeys.publicKey).toBe("PUBo3");
    expect(status.wrap).toBe("WRAPO3");
    expect(status.recovery.wrappedKey).toBe("R2");
  });

  it("recovery PUT is owner-only", async () => {
    await ownerSetup();
    await as("m", "member", hid);
    const forbidden = await recoveryPUT(
      new Request("http://localhost/api/crypto/recovery", {
        method: "PUT",
        body: JSON.stringify({ wrappedKey: "R3", iv: "I3", kdf }),
      })
    );
    expect(forbidden.status).toBe(403);

    await as("o", "owner", hid);
    const ok = await recoveryPUT(
      new Request("http://localhost/api/crypto/recovery", {
        method: "PUT",
        body: JSON.stringify({ wrappedKey: "R3", iv: "I3", kdf }),
      })
    );
    expect(ok.status).toBe(200);
    expect((await (await statusGET()).json()).recovery.wrappedKey).toBe("R3");
  });
});
