import { describe, it, expect } from "vitest";
import { generateDataKey } from "../keys";
import { openBytes, sealBytes } from "../bytes";

const AAD = "1:pdf:apt-1";

function bytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  for (let i = 0; i < n; i++) out[i] = (i * 7) % 256;
  return out;
}

describe("sealBytes / openBytes", () => {
  it("round-trips under a key and hides the plaintext", async () => {
    const key = await generateDataKey();
    const plain = bytes(1000);
    const sealed = await sealBytes(key, plain, AAD);
    expect(sealed.iv).not.toBeNull();
    expect(sealed.ct.length).toBe(plain.length + 16); // GCM tag
    expect(Buffer.from(sealed.ct).equals(Buffer.from(plain))).toBe(false);
    const opened = await openBytes(key, sealed, AAD);
    expect(Buffer.from(opened).equals(Buffer.from(plain))).toBe(true);
  });

  it("fails to open under a different AAD", async () => {
    const key = await generateDataKey();
    const sealed = await sealBytes(key, bytes(32), AAD);
    await expect(openBytes(key, sealed, "1:pdf:apt-2")).rejects.toThrow();
  });

  it("passes bytes through with a null iv when the key is null (encryption off)", async () => {
    const plain = bytes(16);
    const sealed = await sealBytes(null, plain, AAD);
    expect(sealed.iv).toBeNull();
    expect(sealed.ct).toBe(plain);
    expect(await openBytes(null, sealed, AAD)).toBe(plain);
  });

  it("refuses plaintext bytes when a key is present", async () => {
    const key = await generateDataKey();
    await expect(
      openBytes(key, { iv: null, ct: bytes(4) }, AAD)
    ).rejects.toThrow("Plaintext bytes in an encrypted deployment");
  });

  it("refuses encrypted bytes without a key", async () => {
    const key = await generateDataKey();
    const sealed = await sealBytes(key, bytes(4), AAD);
    await expect(openBytes(null, sealed, AAD)).rejects.toThrow(
      "Cannot open encrypted bytes without a key"
    );
  });

  it("requires an AAD", async () => {
    await expect(sealBytes(null, bytes(4), "")).rejects.toThrow(
      "AAD is required to seal or open bytes"
    );
  });

  it("detects tampered ciphertext", async () => {
    const key = await generateDataKey();
    const plain = bytes(100);
    const sealed = await sealBytes(key, plain, AAD);
    // Flip one bit in the ciphertext
    sealed.ct[0] ^= 0xff;
    await expect(openBytes(key, sealed, AAD)).rejects.toThrow();
  });

  it("round-trips an empty byte array", async () => {
    const key = await generateDataKey();
    const plain = new Uint8Array(0);
    const sealed = await sealBytes(key, plain, AAD);
    const opened = await openBytes(key, sealed, AAD);
    expect(opened.length).toBe(0);
  });
});
