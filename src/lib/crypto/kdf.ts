import { argon2id } from "hash-wasm";

export interface KdfParams {
  memoryKib: number;
  iterations: number;
  parallelism: number;
  // Bumped only if the derivation itself changes; stored rows record the
  // version they were derived under so old keys stay unwrappable.
  version: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  memoryKib: 65536,
  iterations: 3,
  parallelism: 1,
  version: 1,
};

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKekBytes(
  secret: string,
  salt: Uint8Array,
  params: KdfParams
): Promise<Uint8Array<ArrayBuffer>> {
  if (params.version !== 1) {
    throw new Error(`Unsupported KDF version ${params.version}`);
  }
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

// The KEK is only ever used to wrap/unwrap other keys, never to encrypt
// data directly, so its usages say exactly that.
export async function deriveKek(
  secret: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS
): Promise<CryptoKey> {
  const bytes = await deriveKekBytes(secret, salt, params);
  try {
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
      "wrapKey",
      "unwrapKey",
    ]);
  } finally {
    bytes.fill(0);
  }
}
