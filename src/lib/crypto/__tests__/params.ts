import type { KdfParams } from "../kdf";

// Small parameters keep the suites fast; the pinned vector in kdf.test.ts
// is the one test that runs the production parameters.
export const TEST_KDF_PARAMS: KdfParams = {
  memoryKib: 1024,
  iterations: 1,
  parallelism: 1,
  version: 1,
};

// Test-only escape hatch for the "no secret crosses the network" assertion in
// flows.test.ts: it needs the raw bytes of a key to search request bodies for.
// It lives inside src/lib/crypto/** because that is the only place allowed to
// touch crypto.subtle, and it only ever accepts an extractable copy the caller
// made deliberately — nothing stored on a device is extractable.
export async function exportRawBase64(key: CryptoKey): Promise<string> {
  const format = key.type === "private" ? "pkcs8" : "raw";
  const bytes = new Uint8Array(await crypto.subtle.exportKey(format, key));
  return btoa(String.fromCharCode(...bytes));
}
