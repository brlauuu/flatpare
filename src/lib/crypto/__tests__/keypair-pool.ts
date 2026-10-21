import { inject } from "vitest";
import { fromBase64, toBase64 } from "../encoding";
import { generateMemberKeypair } from "../keys";

// RSA-OAEP-3072 key generation is CPU-bound and costs 250-900ms per pair on
// an idle machine; under the parallel coverage run it was what pushed single
// tests in flows.test.ts and keys.test.ts past the 15s timeout (#361). So
// src/test-global-setup.ts generates a few pairs ONCE per run and provides
// them to every file, and tests take a pair from the pool instead of
// generating one. Importing a pair is milliseconds.
//
// Pairs come out round-robin, so consecutive takes are distinct pairs as long
// as one test needs fewer than POOL_SIZE of them. The one test that needs the
// real generator (keys.test.ts, "is RSA-OAEP-3072/SHA-256 ...") still calls it.
export const POOL_SIZE = 8;

export interface PooledKeypair {
  publicSpki: string;
  privatePkcs8: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    memberKeypairs: PooledKeypair[];
  }
}

export async function generateKeypairPool(): Promise<PooledKeypair[]> {
  return Promise.all(
    Array.from({ length: POOL_SIZE }, async () => {
      const pair = await generateMemberKeypair();
      return {
        publicSpki: toBase64(await crypto.subtle.exportKey("spki", pair.publicKey)),
        privatePkcs8: toBase64(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
      };
    })
  );
}

const RSA_IMPORT: RsaHashedImportParams = { name: "RSA-OAEP", hash: "SHA-256" };
let next = 0;

// Same shape as generateMemberKeypair(): both halves extractable, the public
// half for wrapKey and the private half for unwrapKey.
export async function takeMemberKeypair(): Promise<CryptoKeyPair> {
  const pool = inject("memberKeypairs");
  if (!pool?.length) throw new Error("No key pair pool: is src/test-global-setup.ts configured?");
  const { publicSpki, privatePkcs8 } = pool[next++ % pool.length];
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey("spki", fromBase64(publicSpki), RSA_IMPORT, true, ["wrapKey"]),
    crypto.subtle.importKey("pkcs8", fromBase64(privatePkcs8), RSA_IMPORT, true, ["unwrapKey"]),
  ]);
  return { publicKey, privateKey };
}
