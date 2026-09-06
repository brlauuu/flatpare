// RFC 4648 base32 alphabet. No 0/1/8/9, so a printed code is unambiguous.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DATA_CHARS = 24; // 120 bits
export const RECOVERY_CODE_LENGTH = DATA_CHARS + 1; // + check char

function checkChar(data: string): string {
  let sum = 0;
  for (const c of data) sum += ALPHABET.indexOf(c);
  return ALPHABET[sum % 32];
}

export function formatRecoveryCode(compact: string): string {
  return compact.match(/.{1,5}/g)!.join("-");
}

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 31];
      acc &= (1 << bits) - 1;
    }
  }
  return formatRecoveryCode(out + checkChar(out));
}

// Accepts whatever the user typed — any case, with or without dashes or
// spaces — and returns the 25-char compact form, which is ALSO the string
// fed to the KDF. Returns null rather than throwing so the UI can show
// "that doesn't look like a recovery code" without an exception path.
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (compact.length !== RECOVERY_CODE_LENGTH) return null;
  if (checkChar(compact.slice(0, DATA_CHARS)) !== compact[DATA_CHARS]) {
    return null;
  }
  return compact;
}
