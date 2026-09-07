import type { EncryptionMode } from "@/lib/encryption-mode";
import { fromBase64, toBase64 } from "./encoding";
import { randomIv } from "./keys";

// v1: AES-256-GCM ciphertext of the JSON-encoded value, bound to its AAD.
// v0: the plaintext value, written only when the deployment runs with
// FLATPARE_ENCRYPTION=off. A row's envelope version is how a reader tells
// which it is; assertEnvelopeMode is how a deployment refuses the other.
export type Envelope =
  | { v: 1; iv: string; ct: string }
  | { v: 0; data: unknown };

const enc = new TextEncoder();
const dec = new TextDecoder();

// Binding a ciphertext to its row stops the server (or anyone with database
// access) from moving a valid ciphertext onto another row or household.
export function envelopeAad(
  householdId: number,
  table: string,
  rowId: number | string
): string {
  return `${householdId}:${table}:${rowId}`;
}

function requireAad(aad: string): Uint8Array<ArrayBuffer> {
  if (!aad) throw new Error("Envelope AAD is required");
  return new Uint8Array(enc.encode(aad));
}

export async function seal(
  key: CryptoKey | null,
  value: unknown,
  aad: string
): Promise<Envelope> {
  const additionalData = requireAad(aad);
  if (key === null) return { v: 0, data: value };
  const iv = randomIv();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    enc.encode(JSON.stringify(value))
  );
  return { v: 1, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function open(
  key: CryptoKey | null,
  envelope: Envelope,
  aad: string
): Promise<unknown> {
  const additionalData = requireAad(aad);
  if (envelope.v === 0) return envelope.data;
  if (key === null) {
    throw new Error("Cannot open an encrypted envelope without a key");
  }
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData },
    key,
    fromBase64(envelope.ct)
  );
  return JSON.parse(dec.decode(pt));
}

export function assertEnvelopeMode(
  envelope: Envelope,
  mode: EncryptionMode
): void {
  if (mode === "on" && envelope.v !== 1) {
    throw new Error("Plaintext envelope in an encrypted deployment");
  }
  if (mode === "off" && envelope.v !== 0) {
    throw new Error("Encrypted envelope in a deployment with encryption off");
  }
}
