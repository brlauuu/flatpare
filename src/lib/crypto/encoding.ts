// Base64 for key material and envelopes. Hand-rolled over btoa/atob rather
// than Uint8Array.prototype.toBase64 because the latter is not in every
// browser this app targets yet. Sizes here are a few KB at most.

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Returns a Uint8Array over a fresh ArrayBuffer, which is what WebCrypto's
// BufferSource parameter type demands.
export function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
