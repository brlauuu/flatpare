import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { clearKeys, loadKeys, seal, open } from "@/lib/crypto";
import { TEST_KDF_PARAMS } from "@/lib/crypto/__tests__/params";
import {
  FlowError,
  fetchStatus,
  runAdoptWrap,
  runChangePassphrase,
  runFulfilPendingWraps,
  runLock,
  runRecover,
  runRegenerateRecovery,
  runResetKeys,
  runSetup,
  runUnlock,
  type StatusResponse,
} from "../flows";

type Member = StatusResponse["memberKeys"];
type Recovery = StatusResponse["recovery"];

// Minimal in-memory stand-in for the /api/crypto routes of Task 6.
const server = {
  keys: new Map<string, NonNullable<Member>>(),
  wraps: new Map<string, string>(),
  recovery: null as Recovery,
  me: { userId: "o", role: "owner" as "owner" | "member" },
  status(): StatusResponse {
    return {
      mode: "on",
      userId: this.me.userId,
      householdId: 1,
      role: this.me.role,
      memberKeys: this.keys.get(this.me.userId) ?? null,
      wrap: this.wraps.get(this.me.userId) ?? null,
      householdHasWraps: this.wraps.size > 0,
      recovery: this.recovery,
    };
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handle(url: string, init?: RequestInit): Promise<Response> {
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const me = server.me.userId;
  switch (`${init?.method ?? "GET"} ${url}`) {
    case "GET /api/crypto/status":
      return json(server.status());
    case "POST /api/crypto/setup":
      server.keys.set(me, body.member);
      if (body.household) {
        server.wraps.set(me, body.household.wrappedKey);
        server.recovery = body.household.recovery;
      }
      return json({}, 201);
    case "GET /api/crypto/pending-wraps":
      return json({
        pending: [...server.keys.entries()]
          .filter(([id]) => !server.wraps.has(id))
          .map(([id, k]) => ({ userId: id, name: id, email: `${id}@x`, publicKey: k.publicKey })),
      });
    case "POST /api/crypto/wraps":
      for (const w of body.wraps) server.wraps.set(w.userId, w.wrappedKey);
      return json({ fulfilled: body.wraps.length });
    case "PUT /api/crypto/member-keys": {
      const k = server.keys.get(me)!;
      server.keys.set(me, { ...k, ...body });
      return json({});
    }
    case "POST /api/crypto/member-keys/reset":
      server.keys.set(me, body);
      server.wraps.delete(me);
      return json({});
    case "POST /api/crypto/recover":
      server.keys.set(me, body.member);
      server.wraps.set(me, body.wrappedKey);
      server.recovery = body.recovery;
      return json({});
    case "PUT /api/crypto/recovery":
      server.recovery = body;
      return json({});
    default:
      return json({ error: `unhandled ${init?.method} ${url}` }, 500);
  }
}

const opts = { kdfParams: TEST_KDF_PARAMS };

beforeEach(async () => {
  server.keys.clear();
  server.wraps.clear();
  server.recovery = null;
  server.me = { userId: "o", role: "owner" };
  await clearKeys();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => handle(url, init)));
});

async function probe(key: CryptoKey) {
  const env = await seal(key, { hello: "world" }, "1:apartments:1");
  return open(key, env, "1:apartments:1");
}

describe("owner setup and unlock", () => {
  it("creates keys, a wrap, and a recovery kit; stores non-extractable keys", async () => {
    const { recoveryCode } = await runSetup(await fetchStatus(), "correct horse battery", opts);
    expect(recoveryCode).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){4}$/);
    expect(server.keys.get("o")?.kdf).toMatchObject({ ...TEST_KDF_PARAMS });
    expect(server.wraps.get("o")).toBeTruthy();
    expect(server.recovery).not.toBeNull();

    const keys = await loadKeys("o", 1);
    expect(keys?.privateKey.extractable).toBe(false);
    expect(keys?.dataKey?.extractable).toBe(false);
    expect(await probe(keys!.dataKey!)).toEqual({ hello: "world" });
  });

  it("unlock on a new device restores the same data key", async () => {
    await runSetup(await fetchStatus(), "correct horse battery", opts);
    const first = (await loadKeys("o", 1))!;
    const sealed = await seal(first.dataKey!, "secret", "1:t:1");
    await runLock();
    expect(await loadKeys("o", 1)).toBeNull();

    await expect(runUnlock(await fetchStatus(), "wrong passphrase!")).rejects.toMatchObject({
      code: "wrong-passphrase",
    });
    const keys = await runUnlock(await fetchStatus(), "correct horse battery");
    expect(await open(keys.dataKey!, sealed, "1:t:1")).toBe("secret");
    expect((await loadKeys("o", 1))?.dataKey).toBeTruthy();
  });

  it("member setup creates keys only and stores no data key", async () => {
    server.me = { userId: "m", role: "member" };
    const { recoveryCode } = await runSetup(await fetchStatus(), "member passphrase!", opts);
    expect(recoveryCode).toBeNull();
    expect(server.wraps.has("m")).toBe(false);
    expect((await loadKeys("m", 1))?.dataKey).toBeNull();
  });
});

describe("pending wraps", () => {
  it("owner wraps to a pending member, who can then unlock", async () => {
    server.me = { userId: "m", role: "member" };
    await runSetup(await fetchStatus(), "member passphrase!", opts);
    await runLock();

    server.me = { userId: "o", role: "owner" };
    await runSetup(await fetchStatus(), "owner passphrase!!", opts);
    const ownerKeys = (await loadKeys("o", 1))!;
    const sealed = await seal(ownerKeys.dataKey!, 42, "1:t:9");
    expect(await runFulfilPendingWraps(await fetchStatus(), ownerKeys)).toEqual({
      count: 1,
      names: ["m"],
    });
    expect(server.wraps.has("m")).toBe(true);
    expect((await runFulfilPendingWraps(await fetchStatus(), ownerKeys)).count).toBe(0);

    server.me = { userId: "m", role: "member" };
    const memberKeys = await runUnlock(await fetchStatus(), "member passphrase!");
    expect(await open(memberKeys.dataKey!, sealed, "1:t:9")).toBe(42);
  });

  it("a pending member adopts an arrived wrap without re-entering the passphrase", async () => {
    server.me = { userId: "m", role: "member" };
    await runSetup(await fetchStatus(), "member passphrase!", opts);
    const pendingKeys = (await loadKeys("m", 1))!;
    expect(pendingKeys.dataKey).toBeNull();

    server.me = { userId: "o", role: "owner" };
    await runSetup(await fetchStatus(), "owner passphrase!!", opts);
    const ownerKeys = (await loadKeys("o", 1))!;
    const sealed = await seal(ownerKeys.dataKey!, "hi", "1:t:2");
    await runFulfilPendingWraps(await fetchStatus(), ownerKeys);

    server.me = { userId: "m", role: "member" };
    const adopted = await runAdoptWrap(await fetchStatus(), pendingKeys);
    expect(await open(adopted.dataKey!, sealed, "1:t:2")).toBe("hi");
    expect((await loadKeys("m", 1))?.dataKey?.extractable).toBe(false);
  });
});

describe("change passphrase / reset", () => {
  it("change passphrase keeps the key pair and rejects the wrong current one", async () => {
    await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const before = server.keys.get("o")!.publicKey;
    await expect(
      runChangePassphrase(await fetchStatus(), "not it at all", "new passphrase!!", opts)
    ).rejects.toMatchObject({ code: "wrong-passphrase" });
    await runChangePassphrase(await fetchStatus(), "old passphrase!!", "new passphrase!!", opts);
    expect(server.keys.get("o")!.publicKey).toBe(before);
    await runLock();
    const keys = await runUnlock(await fetchStatus(), "new passphrase!!");
    expect(keys.dataKey).toBeTruthy();
  });

  it("reset installs a new key pair and drops the wrap", async () => {
    await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const before = server.keys.get("o")!.publicKey;
    await runResetKeys(await fetchStatus(), "fresh passphrase!", opts);
    expect(server.keys.get("o")!.publicKey).not.toBe(before);
    expect(server.wraps.has("o")).toBe(false);
    expect((await loadKeys("o", 1))?.dataKey).toBeNull();
  });
});

describe("recovery", () => {
  it("recovers the data key from the code and issues a new kit", async () => {
    const { recoveryCode } = await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const sealed = await seal((await loadKeys("o", 1))!.dataKey!, "x", "1:t:1");
    await runLock();

    await expect(
      runRecover(await fetchStatus(), "AAAAA-AAAAA-AAAAA-AAAAA-AAAAB", "new passphrase!!", opts)
    ).rejects.toMatchObject({ code: "bad-recovery-code" });

    const result = await runRecover(
      await fetchStatus(),
      recoveryCode!.toLowerCase(),
      "new passphrase!!",
      opts
    );
    expect(result.recoveryCode).not.toBe(recoveryCode);
    const keys = (await loadKeys("o", 1))!;
    expect(await open(keys.dataKey!, sealed, "1:t:1")).toBe("x");

    // The old code no longer works, the new one does.
    await runLock();
    await expect(
      runRecover(await fetchStatus(), recoveryCode!, "another passphrase", opts)
    ).rejects.toMatchObject({ code: "bad-recovery-code" });
    await runRecover(await fetchStatus(), result.recoveryCode, "another passphrase", opts);
  });

  it("regenerate replaces the kit without touching keys", async () => {
    const { recoveryCode } = await runSetup(await fetchStatus(), "old passphrase!!", opts);
    const keys = (await loadKeys("o", 1))!;
    const { recoveryCode: next } = await runRegenerateRecovery(await fetchStatus(), keys, opts);
    expect(next).not.toBe(recoveryCode);
    await runLock();
    await runRecover(await fetchStatus(), next, "new passphrase!!", opts);
    expect((await loadKeys("o", 1))?.dataKey).toBeTruthy();
  });
});

describe("FlowError", () => {
  it("surfaces the server's error message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Encryption is off for this deployment" }, 409))
    );
    await expect(fetchStatus()).rejects.toMatchObject({
      code: "http",
      message: "Encryption is off for this deployment",
    });
    expect(new FlowError("x", "state").code).toBe("state");
  });
});
