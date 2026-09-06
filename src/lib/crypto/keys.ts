import { fromBase64, toBase64 } from "./encoding";

const RSA_GEN: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 3072,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};
const RSA_IMPORT: RsaHashedImportParams = { name: "RSA-OAEP", hash: "SHA-256" };
const AES: AesKeyGenParams = { name: "AES-GCM", length: 256 };

// A wrapped key plus the IV it was wrapped under, both base64.
export interface WrappedBlob {
  wrapped: string;
  iv: string;
}

export interface UnwrapOptions {
  // WebCrypto can only wrap an EXTRACTABLE key. Flows that need to re-wrap
  // (change passphrase, fulfil a wrap for a new member, regenerate the
  // recovery kit) unwrap a transient extractable copy, use it, and drop it.
  // Nothing extractable is ever persisted — see store.ts.
  extractable?: boolean;
}

export function randomIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(12));
}

// Generated extractable because the private half has to be wrapped once;
// the caller converts it to a stored key by unwrapping (unwrapPrivateKey)
// and never keeps this pair around.
export function generateMemberKeypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_GEN, true, ["wrapKey", "unwrapKey"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(await crypto.subtle.exportKey("spki", key));
}

export function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", fromBase64(spkiB64), RSA_IMPORT, true, [
    "wrapKey",
  ]);
}

export async function wrapPrivateKey(
  privateKey: CryptoKey,
  kek: CryptoKey
): Promise<WrappedBlob> {
  const iv = randomIv();
  const wrapped = await crypto.subtle.wrapKey("pkcs8", privateKey, kek, {
    name: "AES-GCM",
    iv,
  });
  return { wrapped: toBase64(wrapped), iv: toBase64(iv) };
}

export function unwrapPrivateKey(
  blob: WrappedBlob,
  kek: CryptoKey,
  opts: UnwrapOptions = {}
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "pkcs8",
    fromBase64(blob.wrapped),
    kek,
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    RSA_IMPORT,
    opts.extractable ?? false,
    ["unwrapKey"]
  );
}

// Extractable so it can be wrapped to the creator's public key and under the
// recovery KEK. Convert with toStoredDataKey before keeping it anywhere.
export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES, true, ["encrypt", "decrypt"]);
}

export async function toStoredDataKey(dataKey: CryptoKey): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dataKey));
  try {
    return await crypto.subtle.importKey("raw", raw, AES, false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    raw.fill(0);
  }
}

export async function wrapDataKey(
  dataKey: CryptoKey,
  publicKey: CryptoKey
): Promise<string> {
  return toBase64(
    await crypto.subtle.wrapKey("raw", dataKey, publicKey, { name: "RSA-OAEP" })
  );
}

export function unwrapDataKey(
  wrappedB64: string,
  privateKey: CryptoKey,
  opts: UnwrapOptions = {}
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrappedB64),
    privateKey,
    { name: "RSA-OAEP" },
    AES,
    opts.extractable ?? false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapDataKeyWithKek(
  dataKey: CryptoKey,
  kek: CryptoKey
): Promise<WrappedBlob> {
  const iv = randomIv();
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, kek, {
    name: "AES-GCM",
    iv,
  });
  return { wrapped: toBase64(wrapped), iv: toBase64(iv) };
}

export function unwrapDataKeyWithKek(
  blob: WrappedBlob,
  kek: CryptoKey,
  opts: UnwrapOptions = {}
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(blob.wrapped),
    kek,
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
    AES,
    opts.extractable ?? false,
    ["encrypt", "decrypt"]
  );
}
