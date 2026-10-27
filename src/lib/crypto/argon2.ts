import { argon2id } from "hash-wasm";
import type { KdfParams } from "./kdf";

// The derivation itself, version 1: Argon2id to 32 bytes. Shared by the main
// thread and the worker (kdf-worker.ts) so the two cannot drift; the pinned
// vector in kdf.test.ts holds both to the same output.
export async function argon2idBytes(
  secret: string,
  salt: Uint8Array,
  params: KdfParams
): Promise<Uint8Array<ArrayBuffer>> {
  const out = await argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKib,
    hashLength: 32,
    outputType: "binary",
  });
  return new Uint8Array(out);
}
