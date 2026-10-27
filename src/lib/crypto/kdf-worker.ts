import { argon2idBytes } from "./argon2";
import type { KdfParams } from "./kdf";

// Runs Argon2id off the page's main thread (#396): at production parameters
// one derivation blocked the page for about 0.5s on a desktop and 2s on a
// slower phone, so nothing responded while unlocking. One worker per
// derivation, terminated by the caller when it answers.

export interface KdfRequest {
  secret: string;
  salt: Uint8Array;
  params: KdfParams;
}

export type KdfResponse = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false };

export async function handleKdfRequest(req: KdfRequest): Promise<KdfResponse> {
  try {
    return { ok: true, bytes: await argon2idBytes(req.secret, req.salt, req.params) };
  } catch {
    // The caller derives again on the main thread, which reports the error.
    return { ok: false };
  }
}

// Only inside a worker: `importScripts` exists in worker scope alone, so
// importing this module elsewhere (the tests) registers nothing.
const scope = globalThis as unknown as {
  importScripts?: unknown;
  onmessage: ((e: MessageEvent<KdfRequest>) => void) | null;
  postMessage(message: KdfResponse, transfer: Transferable[]): void;
};
if (typeof scope.importScripts === "function") {
  scope.onmessage = (e) => {
    void handleKdfRequest(e.data).then((res) =>
      scope.postMessage(res, res.ok ? [res.bytes.buffer] : [])
    );
  };
}
