import { argon2idBytes } from "./argon2";
import type { KdfRequest, KdfResponse } from "./kdf-worker";

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
  return (
    (await deriveInWorker({ secret, salt, params })) ??
    (await argon2idBytes(secret, salt, params))
  );
}

// Argon2id in a Web Worker, so the page keeps responding while it runs
// (#396). Null whenever a worker cannot do it — none in this environment
// (tests, server), it failed to start, or it reported a failure — and the
// caller then derives on the main thread as before: slower to the eye, never
// stuck and never a different result.
function deriveInWorker(req: KdfRequest): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof Worker === "undefined") return Promise.resolve(null);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./kdf-worker.ts", import.meta.url), { type: "module" });
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const finish = (bytes: Uint8Array<ArrayBuffer> | null) => {
      worker.terminate();
      resolve(bytes);
    };
    worker.onmessage = (e: MessageEvent<KdfResponse>) => finish(e.data.ok ? e.data.bytes : null);
    worker.onerror = () => finish(null);
    worker.onmessageerror = () => finish(null);
    worker.postMessage(req);
  });
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
