import { describe, it, expect } from "vitest";
import {
  setupSchema,
  wrapsSchema,
  changePassphraseSchema,
  recoverSchema,
  envelopeSchema,
} from "../crypto-schemas";

const kdf = { salt: "AAAA", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 };
const member = {
  publicKey: "AAAA",
  wrappedPrivateKey: "AAAA",
  privateKeyIv: "AAAA",
  kdf,
};
const recovery = { wrappedKey: "AAAA", iv: "AAAA", kdf };

describe("setupSchema", () => {
  it("accepts a member-only body", () => {
    expect(setupSchema.safeParse({ member }).success).toBe(true);
  });

  it("accepts a member + household body", () => {
    const r = setupSchema.safeParse({
      member,
      household: { wrappedKey: "AAAA", recovery },
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-base64 material", () => {
    const r = setupSchema.safeParse({
      member: { ...member, publicKey: "not base64!" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects KDF parameters outside the allowed range", () => {
    const r = setupSchema.safeParse({
      member: { ...member, kdf: { ...kdf, memoryKib: 16 } },
    });
    expect(r.success).toBe(false);
    const v = setupSchema.safeParse({
      member: { ...member, kdf: { ...kdf, version: 2 } },
    });
    expect(v.success).toBe(false);
  });
});

describe("wrapsSchema", () => {
  it("requires at least one wrap and at most 50", () => {
    expect(wrapsSchema.safeParse({ wraps: [] }).success).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({
      userId: `u${i}`,
      wrappedKey: "AAAA",
      publicKey: "BBBB",
    }));
    expect(wrapsSchema.safeParse({ wraps: many }).success).toBe(false);
    expect(
      wrapsSchema.safeParse({
        wraps: [{ userId: "u1", wrappedKey: "AAAA", publicKey: "BBBB" }],
      }).success
    ).toBe(true);
  });

  it("requires the public key the wrap was made for", () => {
    expect(
      wrapsSchema.safeParse({ wraps: [{ userId: "u1", wrappedKey: "AAAA" }] }).success
    ).toBe(false);
    expect(
      wrapsSchema.safeParse({
        wraps: [{ userId: "u1", wrappedKey: "AAAA", publicKey: "not base64!" }],
      }).success
    ).toBe(false);
  });
});

describe("changePassphraseSchema / recoverSchema", () => {
  it("accept well-formed bodies", () => {
    expect(
      changePassphraseSchema.safeParse({
        wrappedPrivateKey: "AAAA",
        privateKeyIv: "AAAA",
        kdf,
      }).success
    ).toBe(true);
    expect(
      recoverSchema.safeParse({ member, wrappedKey: "AAAA", recovery }).success
    ).toBe(true);
  });
});

describe("envelopeSchema", () => {
  it("accepts a v1 envelope with a large ciphertext", () => {
    const ct = "A".repeat(500_000);
    expect(
      envelopeSchema.parse({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct })
    ).toEqual({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct });
  });

  it("accepts a v0 envelope with arbitrary data", () => {
    expect(envelopeSchema.parse({ v: 0, data: { name: "Flat" } })).toEqual({
      v: 0,
      data: { name: "Flat" },
    });
  });

  it("rejects unknown versions and non-base64 ciphertext", () => {
    expect(envelopeSchema.safeParse({ v: 2, iv: "AA==", ct: "AA==" }).success).toBe(false);
    expect(envelopeSchema.safeParse({ v: 1, iv: "AA==", ct: "not base64!" }).success).toBe(false);
    expect(envelopeSchema.safeParse({ v: 1, iv: "AA==" }).success).toBe(false);
  });
});
