import { fromBase64, toBase64 } from "./encoding";
import { randomIv } from "./keys";

// The file-shaped sibling of envelope.ts: AES-256-GCM over raw bytes (a
// PDF), bound to its row by AAD so a ciphertext cannot be moved between
// apartments or households. `iv: null` marks bytes stored in the clear,
// which only an encryption-off deployment produces.
export interface SealedBytes {
  iv: string | null;
  ct: Uint8Array<ArrayBuffer>;
}

const enc = new TextEncoder();

function requireAad(aad: string): Uint8Array<ArrayBuffer> {
  if (!aad) throw new Error("AAD is required to seal or open bytes");
  return new Uint8Array(enc.encode(aad));
}

export async function sealBytes(
  key: CryptoKey | null,
  bytes: Uint8Array<ArrayBuffer>,
  aad: string
): Promise<SealedBytes> {
  const additionalData = requireAad(aad);
  if (key === null) return { iv: null, ct: bytes };
  const iv = randomIv();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    bytes
  );
  return { iv: toBase64(iv), ct: new Uint8Array(ct) };
}

export async function openBytes(
  key: CryptoKey | null,
  sealed: SealedBytes,
  aad: string
): Promise<Uint8Array<ArrayBuffer>> {
  const additionalData = requireAad(aad);
  if (sealed.iv === null) {
    if (key !== null) {
      throw new Error("Plaintext bytes in an encrypted deployment");
    }
    return sealed.ct;
  }
  if (key === null) {
    throw new Error("Cannot open encrypted bytes without a key");
  }
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData },
    key,
    sealed.ct
  );
  return new Uint8Array(pt);
}
