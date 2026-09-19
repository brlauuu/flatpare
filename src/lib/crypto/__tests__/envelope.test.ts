import { describe, it, expect } from "vitest";
import { generateDataKey } from "../keys";
import { assertEnvelopeMode, envelopeAad, open, seal } from "../envelope";

describe("envelope", () => {
  const aad = envelopeAad(7, "apartments", 42);

  it("builds the AAD as householdId:table:rowId", () => {
    expect(aad).toBe("7:apartments:42");
  });

  it("round-trips a JSON value under a key", async () => {
    const key = await generateDataKey();
    const env = await seal(key, { name: "Flat", rent: 1200 }, aad);
    expect(env.v).toBe(1);
    expect(await open(key, env, aad)).toEqual({ name: "Flat", rent: 1200 });
  });

  it("uses a fresh IV per seal", async () => {
    const key = await generateDataKey();
    const a = await seal(key, "x", aad);
    const b = await seal(key, "x", aad);
    expect(a).not.toEqual(b);
  });

  it("refuses to open under a different AAD (row moved or relabelled)", async () => {
    const key = await generateDataKey();
    const env = await seal(key, "secret", aad);
    await expect(open(key, env, envelopeAad(7, "apartments", 43))).rejects.toThrow();
  });

  it("refuses a tampered ciphertext", async () => {
    const key = await generateDataKey();
    const env = await seal(key, "secret", aad);
    if (env.v !== 1) throw new Error("expected v1");
    const flipped = { ...env, ct: env.ct.slice(0, -4) + "AAAA" };
    await expect(open(key, flipped, aad)).rejects.toThrow();
  });

  it("requires a non-empty AAD", async () => {
    const key = await generateDataKey();
    await expect(seal(key, "x", "")).rejects.toThrow(/AAD/);
  });

  it("produces and opens plaintext envelopes when there is no key", async () => {
    const env = await seal(null, { a: 1 }, aad);
    expect(env).toEqual({ v: 0, data: { a: 1 } });
    expect(await open(null, env, aad)).toEqual({ a: 1 });
  });

  it("cannot open an encrypted envelope without a key", async () => {
    const key = await generateDataKey();
    const env = await seal(key, "x", aad);
    await expect(open(null, env, aad)).rejects.toThrow(/without a key/);
  });

  it("assertEnvelopeMode rejects the wrong kind for the mode", async () => {
    const key = await generateDataKey();
    const encrypted = await seal(key, "x", aad);
    const plain = await seal(null, "x", aad);
    expect(() => assertEnvelopeMode(encrypted, "on")).not.toThrow();
    expect(() => assertEnvelopeMode(plain, "off")).not.toThrow();
    expect(() => assertEnvelopeMode(plain, "on")).toThrow(/plaintext/i);
    expect(() => assertEnvelopeMode(encrypted, "off")).toThrow(/encrypted/i);
  });
});

// #219
describe("key version", () => {
  it("stamps the version it was given, defaulting to 1, and never on v0", async () => {
    const key = await generateDataKey();
    const one = await seal(key, { a: 1 }, "1:t:r");
    const two = await seal(key, { a: 1 }, "1:t:r", 2);
    expect(one.v === 1 && one.k).toBe(1);
    expect(two.v === 1 && two.k).toBe(2);
    expect(await open(key, two, "1:t:r")).toEqual({ a: 1 });
    const plain = await seal(null, { a: 1 }, "1:t:r", 2);
    expect(plain).toEqual({ v: 0, data: { a: 1 } });
  });
});
