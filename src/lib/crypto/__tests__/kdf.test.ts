import { describe, it, expect } from "vitest";
import {
  DEFAULT_KDF_PARAMS,
  deriveKek,
  deriveKekBytes,
  randomSalt,
} from "../kdf";
import { TEST_KDF_PARAMS } from "./params";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("deriveKekBytes", () => {
  it("matches the pinned Argon2id vector at production parameters", async () => {
    // Pinned on 2026-09-06 with hash-wasm 4.12.0. If this changes, every
    // stored key becomes unrecoverable: treat a failure here as a release
    // blocker, never as a fixture to update.
    const salt = new Uint8Array(16).map((_, i) => i);
    const out = await deriveKekBytes(
      "correct horse battery staple",
      salt,
      DEFAULT_KDF_PARAMS
    );
    expect(hex(out)).toBe(
      "0d1a3c6523c8f06e4e0af9c515aa5b5448cfebd6838f2d52c3d8b6ef8ddc3c2e"
    );
  }, 30_000);

  it("is deterministic and salt-sensitive", async () => {
    const salt = randomSalt();
    const a = await deriveKekBytes("pw", salt, TEST_KDF_PARAMS);
    const b = await deriveKekBytes("pw", salt, TEST_KDF_PARAMS);
    const c = await deriveKekBytes("pw", randomSalt(), TEST_KDF_PARAMS);
    expect(hex(a)).toBe(hex(b));
    expect(hex(a)).not.toBe(hex(c));
  });

  it("rejects an unknown KDF version", async () => {
    await expect(
      deriveKekBytes("pw", randomSalt(), { ...TEST_KDF_PARAMS, version: 2 })
    ).rejects.toThrow(/version/);
  });
});

describe("deriveKek", () => {
  it("returns a non-extractable AES-GCM wrapping key", async () => {
    const kek = await deriveKek("pw", randomSalt(), TEST_KDF_PARAMS);
    expect(kek.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(kek.extractable).toBe(false);
    expect([...kek.usages].sort()).toEqual(["unwrapKey", "wrapKey"]);
    await expect(crypto.subtle.exportKey("raw", kek)).rejects.toThrow();
  });
});

describe("randomSalt", () => {
  it("is 16 bytes and not constant", () => {
    const a = randomSalt();
    expect(a).toHaveLength(16);
    expect(hex(a)).not.toBe(hex(randomSalt()));
  });
});
