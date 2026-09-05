import { createHmac, timingSafeEqual } from "node:crypto";

// Used only by the self-host credentials provider (src/auth.ts) now that the
// shared-password + display-name model has been removed. Kept as its own
// constant-time comparison rather than a plain `===`, which would leak
// timing information about how many leading bytes matched.
export function verifyPassword(input: string): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password || !input) return false;

  // Hash both sides first: timingSafeEqual throws on a length mismatch, so
  // comparing the raw strings would both leak length and crash on input of
  // the wrong size. Equal-length digests avoid that.
  const inputHash = createHmac("sha256", password).update(input).digest();
  const expectedHash = createHmac("sha256", password).update(password).digest();

  return timingSafeEqual(inputHash, expectedHash);
}
