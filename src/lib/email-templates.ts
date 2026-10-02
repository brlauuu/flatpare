// The words of each email (#300). Pure functions: no env, no I/O, no imports.
//
// What an email may contain is a privacy decision, not a copy decision.
// Household data is end-to-end encrypted and the server cannot read it, so
// there is nothing of it to put here. An invitation carries exactly two
// things the server already holds in plaintext: the inviter's display name
// and a link to the site. It does NOT carry the household's name.

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A display name comes from the sign-in provider and is attacker-chosen as
// far as this file is concerned. Strip line breaks (it goes in the subject)
// and cap it, so it cannot forge headers or bury the real message.
export function safeName(raw: string | null | undefined): string {
  const cleaned = (raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Someone";
  return cleaned.length > 60 ? `${cleaned.slice(0, 59)}…` : cleaned;
}

function shell(paragraphs: string[], button: { href: string; label: string }): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`)
    .join("");
  return (
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;color:#111;max-width:520px;margin:0 auto;padding:24px">` +
    body +
    `<p style="margin:24px 0"><a href="${escapeHtml(button.href)}" style="background:#0f6b70;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">${escapeHtml(button.label)}</a></p>` +
    `<p style="margin:0;font-size:13px;color:#666;line-height:1.5">If the button does not work, open ${escapeHtml(button.href)}</p>` +
    `</div>`
  );
}

// The magic link (#310). The URL is the credential: it carries the token
// Auth.js verifies, so this email must reach exactly the address typed and
// say nothing that helps anyone else. The link is single-use and expires.
export function magicLinkEmail(input: { url: string; siteHost: string; minutes: number }): RenderedEmail {
  const lines = [
    `Here is your sign-in link for Flatpare (${input.siteHost}).`,
    `It works once and expires in ${input.minutes} minutes. Open it in the same browser you asked from.`,
    "If you did not ask for this, ignore this email; nothing happens without the link.",
  ];
  return {
    subject: "Your Flatpare sign-in link",
    text: [lines[0], input.url, lines[1], lines[2]].join("\n\n"),
    html: shell(lines.map(escapeHtml), { href: input.url, label: "Sign in to Flatpare" }),
  };
}

export function memberRemovedEmail(input: {
  removerName: string | null | undefined;
  siteUrl: string;
}): RenderedEmail {
  const name = safeName(input.removerName);
  const lines = [
    `${name} removed you from their household on Flatpare.`,
    "You no longer have access to its apartments, ratings or locations. Your account is unchanged: sign in and you will find an empty household of your own, and any invitation you accept later still works.",
    "If this is unexpected, the person who removed you is the one to ask.",
  ];
  return {
    subject: "You were removed from a household on Flatpare",
    text: [lines[0], lines[1], input.siteUrl, lines[2]].join("\n\n"),
    html: shell(lines.map(escapeHtml), { href: input.siteUrl, label: "Open Flatpare" }),
  };
}

export function householdInvitationEmail(input: {
  inviterName: string | null | undefined;
  invitedEmail: string;
  siteUrl: string;
  expiresAt: Date;
}): RenderedEmail {
  const name = safeName(input.inviterName);
  const until = input.expiresAt.toISOString().slice(0, 10);
  const lines = [
    `${name} invited you to compare apartments together on Flatpare.`,
    `Sign in with ${input.invitedEmail} and the invitation will be waiting for you. It is valid until ${until}.`,
    "If you were not expecting this, you can ignore this email and nothing will happen.",
  ];
  return {
    subject: `${name} invited you to Flatpare`,
    text: [...lines.slice(0, 2), input.siteUrl, lines[2]].join("\n\n"),
    html: shell(lines.map(escapeHtml), { href: input.siteUrl, label: "Open Flatpare" }),
  };
}
