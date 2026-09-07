import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateDataKey, generateMemberKeypair, toStoredDataKey } from "../keys";
import { clearKeys, isKeyStorePersistent, loadKeys, saveKeys } from "../store";

// generateMemberKeypair() is extractable by design (the private half has to
// be wrapped once); the store only accepts non-extractable keys, so re-import
// the private key the way unwrapPrivateKey would.
async function storedPrivateKey() {
  const pair = await generateMemberKeypair();
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["unwrapKey"]
  );
}

async function fixture() {
  return {
    userId: "u1",
    householdId: 1,
    privateKey: await storedPrivateKey(),
    dataKey: await toStoredDataKey(await generateDataKey()),
  };
}

describe("key store", () => {
  beforeEach(async () => {
    await clearKeys();
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadKeys("u1", 1)).toBeNull();
  });

  it("round-trips CryptoKeys and keeps them non-extractable", async () => {
    const keys = await fixture();
    await saveKeys(keys);
    const loaded = await loadKeys("u1", 1);
    expect(loaded).not.toBeNull();
    expect(loaded!.dataKey).toBeInstanceOf(CryptoKey);
    expect(loaded!.dataKey!.extractable).toBe(false);
    expect(loaded!.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", loaded!.dataKey!)).rejects.toThrow();
  });

  it("stores a private key with no data key yet (member awaiting a wrap)", async () => {
    await saveKeys({ ...(await fixture()), dataKey: null });
    const loaded = await loadKeys("u1", 1);
    expect(loaded!.dataKey).toBeNull();
    expect(loaded!.privateKey.extractable).toBe(false);
  });

  it("refuses an extractable key", async () => {
    const pair = await generateMemberKeypair();
    await expect(
      saveKeys({ ...(await fixture()), privateKey: pair.privateKey })
    ).rejects.toThrow(/extractable/);
    await expect(
      saveKeys({ ...(await fixture()), dataKey: await generateDataKey() })
    ).rejects.toThrow(/extractable/);
  });

  it("returns null and clears the store when the identity does not match", async () => {
    await saveKeys(await fixture());
    expect(await loadKeys("someone-else", 1)).toBeNull();
    expect(await loadKeys("u1", 1)).toBeNull();
  });

  it("clearKeys removes everything", async () => {
    await saveKeys(await fixture());
    await clearKeys();
    expect(await loadKeys("u1", 1)).toBeNull();
  });

  it("reports a persistent store when IndexedDB works", async () => {
    await saveKeys(await fixture());
    expect(isKeyStorePersistent()).toBe(true);
  });

  it("falls back to memory when IndexedDB is unavailable", async () => {
    const original = globalThis.indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    try {
      const keys = await fixture();
      await saveKeys(keys);
      expect(isKeyStorePersistent()).toBe(false);
      expect((await loadKeys("u1", 1))?.privateKey).toBe(keys.privateKey);
      await clearKeys();
      expect(await loadKeys("u1", 1)).toBeNull();
    } finally {
      vi.stubGlobal("indexedDB", original);
    }
  });
});
