import { describe, it, expect } from "vitest";
import { toBase64 } from "../encoding";
import { FINGERPRINT_EMOJI, FINGERPRINT_LENGTH, fingerprint } from "../fingerprint";
import { exportPublicKey, publicKeyFromPrivate } from "../keys";
import { takeMemberKeypair } from "./keypair-pool";

// Code points that existed by Unicode 9 (2016), so the set renders on older
// systems too. Ranges, not a lookup table: the emoji blocks were filled in
// order, and every later addition sits outside these.
const UNICODE_9_RANGES: [number, number][] = [
  [0x2300, 0x2bff],
  [0x1f300, 0x1f5ff],
  [0x1f680, 0x1f6d2],
  [0x1f6f0, 0x1f6f6],
  [0x1f910, 0x1f93e],
  [0x1f940, 0x1f94b],
  [0x1f950, 0x1f95e],
  [0x1f980, 0x1f991],
  [0x1f9c0, 0x1f9c0],
];
// The faces block: dozens of near-duplicates nobody could tell apart by
// description (grinning, beaming, smiling with open mouth...).
const FACES: [number, number] = [0x1f600, 0x1f64f];

describe("FINGERPRINT_EMOJI", () => {
  it("has 256 distinct entries, one per byte value", () => {
    expect(FINGERPRINT_EMOJI).toHaveLength(256);
    expect(new Set(FINGERPRINT_EMOJI).size).toBe(256);
  });

  it("is single code points with emoji presentation, no modifiers, sequences or flags", () => {
    for (const e of FINGERPRINT_EMOJI) {
      expect([...e], e).toHaveLength(1);
      expect(e, e).toMatch(/^\p{Emoji_Presentation}$/u);
      // Skin tones attach to these, and a description would have to say which.
      expect(e, e).not.toMatch(/\p{Emoji_Modifier_Base}/u);
      expect(e, e).not.toMatch(/\p{Regional_Indicator}/u);
    }
  });

  it("dates from Unicode 9 or earlier and has no faces", () => {
    for (const e of FINGERPRINT_EMOJI) {
      const cp = e.codePointAt(0)!;
      expect(UNICODE_9_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi), e).toBe(true);
      expect(cp >= FACES[0] && cp <= FACES[1], e).toBe(false);
    }
  });
});

describe("fingerprint", () => {
  it("matches the pinned vector", async () => {
    // Pinned on 2026-10-21 (#218). A change here changes every member's
    // fingerprint: the set's order is part of the format. Treat a failure
    // as a decision, never as a fixture to update.
    // SHA-256 of bytes 00..1f starts 63 0d cd 29 66 c4 33 66.
    const spki = toBase64(new Uint8Array(32).map((_, i) => i));
    expect((await fingerprint(spki)).join("")).toBe("🥝🐧⌛🦈🥜💡🐚🥜");
  });

  it("is 8 emoji from the set, deterministic, and differs between keys", async () => {
    const a = await exportPublicKey((await takeMemberKeypair()).publicKey);
    const b = await exportPublicKey((await takeMemberKeypair()).publicKey);
    const fa = await fingerprint(a);
    expect(fa).toHaveLength(FINGERPRINT_LENGTH);
    for (const e of fa) expect(FINGERPRINT_EMOJI).toContain(e);
    expect(await fingerprint(a)).toEqual(fa);
    expect(await fingerprint(b)).not.toEqual(fa);
  });
});

describe("publicKeyFromPrivate", () => {
  it("recovers exactly the pair's public key from an extractable private key", async () => {
    const pair = await takeMemberKeypair();
    expect(await publicKeyFromPrivate(pair.privateKey)).toBe(await exportPublicKey(pair.publicKey));
  });

  it("refuses a non-extractable private key", async () => {
    const pair = await takeMemberKeypair();
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    const locked = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["unwrapKey"]
    );
    await expect(publicKeyFromPrivate(locked)).rejects.toThrow();
  });
});
