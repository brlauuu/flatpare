import {
  DEFAULT_KDF_PARAMS,
  clearKeys,
  deriveKek,
  exportPublicKey,
  fromBase64,
  generateDataKey,
  generateMemberKeypair,
  generateRecoveryCode,
  importPublicKey,
  normalizeRecoveryCode,
  randomSalt,
  saveKeys,
  toBase64,
  toStoredDataKey,
  unwrapDataKey,
  unwrapDataKeyWithKek,
  unwrapPrivateKey,
  wrapDataKey,
  wrapDataKeyWithKek,
  wrapPrivateKey,
  type KdfParams,
  type StoredKeys,
} from "@/lib/crypto";
import type { EncryptionMode } from "@/lib/encryption-mode";
import type { CryptoStatus, PendingWrap } from "@/lib/member-keys";

export type StatusResponse = CryptoStatus & { mode: EncryptionMode };

export type FlowErrorCode = "wrong-passphrase" | "bad-recovery-code" | "http" | "state";

export class FlowError extends Error {
  constructor(
    message: string,
    public readonly code: FlowErrorCode
  ) {
    super(message);
    this.name = "FlowError";
  }
}

export interface FlowOptions {
  // Tests pass small Argon2 parameters; production callers leave this unset.
  kdfParams?: KdfParams;
}

// The server's KDF row shape (src/lib/crypto-schemas.ts) carries the salt;
// the library's KdfParams does not. Split/join here.
type KdfRow = KdfParams & { salt: string };

function kdfRow(salt: Uint8Array, params: KdfParams): KdfRow {
  return { salt: toBase64(salt), ...params };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `${init?.method ?? "GET"} ${path} failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new FlowError(message, "http");
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });

export function fetchStatus(): Promise<StatusResponse> {
  return api<StatusResponse>("/api/crypto/status");
}

// AES-GCM unwrap fails with an OperationError on a wrong key; that is the
// only signal we get that the passphrase was wrong.
async function unwrapOrWrongPassphrase<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch {
    throw new FlowError("Wrong passphrase", "wrong-passphrase");
  }
}

function requireMemberKeys(status: StatusResponse) {
  if (!status.memberKeys) throw new FlowError("No keys to unlock", "state");
  return status.memberKeys;
}

async function makeMemberMaterial(passphrase: string, params: KdfParams) {
  const salt = randomSalt();
  const kek = await deriveKek(passphrase, salt, params);
  const pair = await generateMemberKeypair();
  const blob = await wrapPrivateKey(pair.privateKey, kek);
  return {
    pair,
    kek,
    blob,
    member: {
      publicKey: await exportPublicKey(pair.publicKey),
      wrappedPrivateKey: blob.wrapped,
      privateKeyIv: blob.iv,
      kdf: kdfRow(salt, params),
    },
  };
}

async function makeRecoveryKit(dataKey: CryptoKey, params: KdfParams) {
  const code = generateRecoveryCode();
  const compact = normalizeRecoveryCode(code);
  if (!compact) throw new FlowError("Generated an invalid recovery code", "state");
  const salt = randomSalt();
  const kek = await deriveKek(compact, salt, params);
  const blob = await wrapDataKeyWithKek(dataKey, kek);
  return {
    code,
    recovery: { wrappedKey: blob.wrapped, iv: blob.iv, kdf: kdfRow(salt, params) },
  };
}

export async function runSetup(
  status: StatusResponse,
  passphrase: string,
  opts: FlowOptions = {}
): Promise<{ recoveryCode: string | null }> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  if (status.memberKeys) throw new FlowError("Keys already exist", "state");
  const { pair, kek, blob, member } = await makeMemberMaterial(passphrase, params);

  const creator = status.role === "owner" && !status.householdHasWraps;
  let dataKey: CryptoKey | null = null;
  let recoveryCode: string | null = null;
  let household:
    | { wrappedKey: string; recovery: { wrappedKey: string; iv: string; kdf: KdfRow } }
    | undefined;

  if (creator) {
    dataKey = await generateDataKey();
    const kit = await makeRecoveryKit(dataKey, params);
    recoveryCode = kit.code;
    household = {
      wrappedKey: await wrapDataKey(dataKey, pair.publicKey),
      recovery: kit.recovery,
    };
  }

  await post("/api/crypto/setup", { member, household });

  await saveKeys({
    userId: status.userId,
    householdId: status.householdId,
    privateKey: await unwrapPrivateKey(blob, kek),
    dataKey: dataKey ? await toStoredDataKey(dataKey) : null,
  });
  return { recoveryCode };
}

export async function runUnlock(
  status: StatusResponse,
  passphrase: string
): Promise<StoredKeys> {
  const m = requireMemberKeys(status);
  const kek = await deriveKek(passphrase, fromBase64(m.kdf.salt), m.kdf);
  const privateKey = await unwrapOrWrongPassphrase(
    unwrapPrivateKey({ wrapped: m.wrappedPrivateKey, iv: m.privateKeyIv }, kek)
  );
  const dataKey = status.wrap ? await unwrapDataKey(status.wrap, privateKey) : null;
  const keys: StoredKeys = {
    userId: status.userId,
    householdId: status.householdId,
    privateKey,
    dataKey,
  };
  await saveKeys(keys);
  return keys;
}

// Wrapping needs an extractable data key; unwrap a transient copy from our
// own wrap and let it go out of scope. The stored key stays non-extractable.
async function transientDataKey(status: StatusResponse, keys: StoredKeys): Promise<CryptoKey> {
  if (!status.wrap) throw new FlowError("You do not hold the household key", "state");
  return unwrapDataKey(status.wrap, keys.privateKey, { extractable: true });
}

export async function runFulfilPendingWraps(
  status: StatusResponse,
  keys: StoredKeys
): Promise<{ count: number; names: string[] }> {
  const { pending } = await api<{ pending: PendingWrap[] }>("/api/crypto/pending-wraps");
  if (pending.length === 0) return { count: 0, names: [] };
  const dataKey = await transientDataKey(status, keys);
  const wraps = [];
  for (const p of pending) {
    const publicKey = await importPublicKey(p.publicKey);
    wraps.push({ userId: p.userId, wrappedKey: await wrapDataKey(dataKey, publicKey) });
  }
  const { fulfilled } = await post<{ fulfilled: number }>("/api/crypto/wraps", { wraps });
  return { count: fulfilled, names: pending.map((p) => p.name ?? p.email) };
}

export async function runAdoptWrap(
  status: StatusResponse,
  keys: StoredKeys
): Promise<StoredKeys> {
  if (!status.wrap) throw new FlowError("No wrap has arrived yet", "state");
  const adopted: StoredKeys = {
    ...keys,
    dataKey: await unwrapDataKey(status.wrap, keys.privateKey),
  };
  await saveKeys(adopted);
  return adopted;
}

export async function runChangePassphrase(
  status: StatusResponse,
  current: string,
  next: string,
  opts: FlowOptions = {}
): Promise<void> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  const m = requireMemberKeys(status);
  const oldKek = await deriveKek(current, fromBase64(m.kdf.salt), m.kdf);
  const transient = await unwrapOrWrongPassphrase(
    unwrapPrivateKey({ wrapped: m.wrappedPrivateKey, iv: m.privateKeyIv }, oldKek, {
      extractable: true,
    })
  );
  const salt = randomSalt();
  const newKek = await deriveKek(next, salt, params);
  const blob = await wrapPrivateKey(transient, newKek);
  await post(
    "/api/crypto/member-keys",
    { wrappedPrivateKey: blob.wrapped, privateKeyIv: blob.iv, kdf: kdfRow(salt, params) },
    "PUT"
  );
}

export async function runResetKeys(
  status: StatusResponse,
  passphrase: string,
  opts: FlowOptions = {}
): Promise<void> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  const { kek, blob, member } = await makeMemberMaterial(passphrase, params);
  await post("/api/crypto/member-keys/reset", member);
  await saveKeys({
    userId: status.userId,
    householdId: status.householdId,
    privateKey: await unwrapPrivateKey(blob, kek),
    dataKey: null,
  });
}

export async function runRecover(
  status: StatusResponse,
  code: string,
  newPassphrase: string,
  opts: FlowOptions = {}
): Promise<{ recoveryCode: string }> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  if (!status.recovery) throw new FlowError("This household has no recovery kit", "state");
  const compact = normalizeRecoveryCode(code);
  if (!compact) throw new FlowError("That recovery code is not valid", "bad-recovery-code");

  const r = status.recovery;
  const recoveryKek = await deriveKek(compact, fromBase64(r.kdf.salt), r.kdf);
  let dataKey: CryptoKey;
  try {
    dataKey = await unwrapDataKeyWithKek({ wrapped: r.wrappedKey, iv: r.iv }, recoveryKek, {
      extractable: true,
    });
  } catch {
    throw new FlowError("That recovery code is not valid", "bad-recovery-code");
  }

  const { pair, kek, blob, member } = await makeMemberMaterial(newPassphrase, params);
  const kit = await makeRecoveryKit(dataKey, params);
  await post("/api/crypto/recover", {
    member,
    wrappedKey: await wrapDataKey(dataKey, pair.publicKey),
    recovery: kit.recovery,
  });
  await saveKeys({
    userId: status.userId,
    householdId: status.householdId,
    privateKey: await unwrapPrivateKey(blob, kek),
    dataKey: await toStoredDataKey(dataKey),
  });
  return { recoveryCode: kit.code };
}

export async function runRegenerateRecovery(
  status: StatusResponse,
  keys: StoredKeys,
  opts: FlowOptions = {}
): Promise<{ recoveryCode: string }> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  const dataKey = await transientDataKey(status, keys);
  const kit = await makeRecoveryKit(dataKey, params);
  await post("/api/crypto/recovery", kit.recovery, "PUT");
  return { recoveryCode: kit.code };
}

export async function runLock(): Promise<void> {
  await clearKeys();
}
