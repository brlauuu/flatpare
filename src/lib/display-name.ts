// A person's display name (#327). A leaf: no app imports.
//
// The name is account data, not household data: it lives in plaintext in
// the Auth.js `users` table, because the server needs it to render the
// Household page and the emails it sends. It never goes in an envelope.
//
// Until a name is set, the email is shown instead (#205). That discloses
// nothing new inside a household — the Household page already lists every
// member's address — but it is not used in emails or on /invitations, which
// reach people outside the household; those keep their own fallbacks.

// The email templates cap names at 60 (`safeName`); accepting no more here
// means that truncation never cuts a name someone chose.
export const MAX_DISPLAY_NAME = 60;

export function displayName(name: string | null, email: string): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : email;
}

// Control characters (line breaks reach email subjects) and the Unicode
// format characters that reorder or hide text (bidi overrides, zero-width).
const FORBIDDEN = /[\p{Cc}\p{Cf}\u2028\u2029]/u;

export type ParsedDisplayName = { ok: true; name: string | null } | { ok: false; error: string };

// Validates a name a user typed. Empty means "clear it" (null), which brings
// back the email fallback. Error messages are fixed strings and never repeat
// the input, so they are safe to return and to log.
export function parseDisplayName(input: unknown): ParsedDisplayName {
  if (typeof input !== "string") return { ok: false, error: "Name must be text." };
  if (FORBIDDEN.test(input)) return { ok: false, error: "Name can't contain line breaks or control characters." };
  const name = input.replace(/\s+/g, " ").trim();
  if (name === "") return { ok: true, name: null };
  if ([...name].length > MAX_DISPLAY_NAME) {
    return { ok: false, error: `Name can be at most ${MAX_DISPLAY_NAME} characters.` };
  }
  return { ok: true, name };
}
