import { describe, it, expect } from "vitest";
import { deriveKek, randomSalt } from "../kdf";
import { TEST_KDF_PARAMS } from "./params";
import {
  exportPublicKey,
  generateDataKey,
  generateMemberKeypair,
  importPublicKey,
  toStoredDataKey,
  unwrapDataKey,
  unwrapDataKeyWithKek,
  unwrapPrivateKey,
  wrapDataKey,
  wrapDataKeyWithKek,
  wrapPrivateKey,
} from "../keys";

async function encryptProbe(key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode("probe")
  );
  return Buffer.from(ct).toString("hex");
}

describe("member keypair", () => {
  it("is RSA-OAEP-3072/SHA-256 and the public key survives export/import", async () => {
    const pair = await generateMemberKeypair();
    expect(pair.publicKey.algorithm).toMatchObject({
      name: "RSA-OAEP",
      modulusLength: 3072,
      hash: { name: "SHA-256" },
    });
    const spki = await exportPublicKey(pair.publicKey);
    const imported = await importPublicKey(spki);
    expect(imported.usages).toEqual(["wrapKey"]);
  });

  it("private key round-trips through a passphrase KEK and comes back non-extractable", async () => {
    const pair = await generateMemberKeypair();
    const kek = await deriveKek("passphrase-12chars", randomSalt(), TEST_KDF_PARAMS);
    const blob = await wrapPrivateKey(pair.privateKey, kek);

    const restored = await unwrapPrivateKey(blob, kek);
    expect(restored.extractable).toBe(false);
    expect(restored.usages).toEqual(["unwrapKey"]);
    await expect(crypto.subtle.exportKey("pkcs8", restored)).rejects.toThrow();

    // An explicitly transient extractable copy is allowed (change-passphrase
    // needs it) but must be requested.
    const transient = await unwrapPrivateKey(blob, kek, { extractable: true });
    expect(transient.extractable).toBe(true);
  });

  it("refuses to unwrap the private key under the wrong passphrase", async () => {
    const pair = await generateMemberKeypair();
    const salt = randomSalt();
    const kek = await deriveKek("right-passphrase", salt, TEST_KDF_PARAMS);
    const wrong = await deriveKek("wrong-passphrase", salt, TEST_KDF_PARAMS);
    const blob = await wrapPrivateKey(pair.privateKey, kek);
    await expect(unwrapPrivateKey(blob, wrong)).rejects.toThrow();
  });
});

describe("data key", () => {
  it("wraps to a public key and unwraps with the private key to the same key", async () => {
    const pair = await generateMemberKeypair();
    const dataKey = await generateDataKey();
    const wrapped = await wrapDataKey(dataKey, pair.publicKey);

    const restored = await unwrapDataKey(wrapped, pair.privateKey);
    expect(restored.extractable).toBe(false);
    expect([...restored.usages].sort()).toEqual(["decrypt", "encrypt"]);
    expect(await encryptProbe(restored)).toBe(await encryptProbe(dataKey));
  });

  it("cannot be unwrapped by a different member's private key", async () => {
    const a = await generateMemberKeypair();
    const b = await generateMemberKeypair();
    const wrapped = await wrapDataKey(await generateDataKey(), a.publicKey);
    await expect(unwrapDataKey(wrapped, b.privateKey)).rejects.toThrow();
  });

  it("toStoredDataKey yields a non-extractable copy of the same key", async () => {
    const dataKey = await generateDataKey();
    const stored = await toStoredDataKey(dataKey);
    expect(stored.extractable).toBe(false);
    expect(await encryptProbe(stored)).toBe(await encryptProbe(dataKey));
  });

  it("round-trips through a recovery KEK", async () => {
    const dataKey = await generateDataKey();
    const rk = await deriveKek("RECOVERYCODE", randomSalt(), TEST_KDF_PARAMS);
    const blob = await wrapDataKeyWithKek(dataKey, rk);
    const restored = await unwrapDataKeyWithKek(blob, rk, { extractable: true });
    expect(restored.extractable).toBe(true);
    expect(await encryptProbe(restored)).toBe(await encryptProbe(dataKey));
  });
});
