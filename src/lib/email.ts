// Outbound email (#300), through Resend's HTTP API.
//
// A LEAF: it imports nothing from the app, the same as safe-url.ts and
// log-scrub.ts, so any layer can send without creating an import cycle.
//
// Email is off unless RESEND_API_KEY is set — the rule every optional cloud
// feature here follows. A self-hoster runs `docker compose up` with no mail
// provider, and inviting must keep working exactly as it did: the invitation
// is created, nothing is sent, and nothing fails.
//
// Plain fetch rather than the SDK on purpose. It is one POST, this keeps the
// leaf free of dependencies, and scripts/beta-pass.mjs (which cannot import
// TypeScript) makes the identical call.

const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  // Resend deduplicates on this for 24 hours, so a retried request cannot
  // deliver the same invitation twice. Format: `<kind>/<id>`.
  idempotencyKey: string;
}

export type EmailResult =
  | { sent: true }
  // "off": no provider configured. "failed": configured, and the send did
  // not go through. Callers treat both as "tell the person yourself".
  | { sent: false; reason: "off" | "failed" };

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && emailFrom() !== null;
}

// The From header. EMAIL_FROM wins, so the address is a deployment setting
// and not a code change. Otherwise it is built from RESEND_EMAIL_DOMAIN,
// which the Vercel integration sets to the domain it verified.
export function emailFrom(): string | null {
  const explicit = process.env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  const domain = process.env.RESEND_EMAIL_DOMAIN?.trim();
  return domain ? `Flatpare <hello@${domain}>` : null;
}

// Never throws and never logs the recipient, the subject or the provider's
// message: an address is personal data, and a provider error can quote the
// request back. The HTTP status or the error's class is enough to tell a bad
// key from an unverified domain from a timeout.
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = emailFrom();
  if (!key || !from) return { sent: false, reason: "off" };

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "idempotency-key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[email] send failed: status=${res.status}`);
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[email] send failed: ${err instanceof Error ? err.name : "NonError"}`);
    return { sent: false, reason: "failed" };
  }
}
