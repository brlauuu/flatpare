// The layout of each email (#300). Pure functions: no env, no I/O. The words
// come from messages/<locale>/emails.json through the `t` each one is given
// (src/locales/email-text.ts, #288); only the owner's beta-request notice,
// an operator message, is English by design.
//
// What an email may contain is a privacy decision, not a copy decision.
// Household data is end-to-end encrypted and the server cannot read it, so
// there is nothing of it to put here. An invitation carries exactly two
// things the server already holds in plaintext: the inviter's display name
// and a link to the site. It does NOT carry the household's name.

import type { EmailText } from "@/locales/email-text";

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
export function safeName(raw: string | null | undefined, fallback = "Someone"): string {
  const cleaned = (raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 60 ? `${cleaned.slice(0, 59)}…` : cleaned;
}

function shell(paragraphs: string[], button: { href: string; label: string }, fallbackLink: string): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`)
    .join("");
  return (
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;color:#111;max-width:520px;margin:0 auto;padding:24px">` +
    body +
    `<p style="margin:24px 0"><a href="${escapeHtml(button.href)}" style="background:#0f6b70;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">${escapeHtml(button.label)}</a></p>` +
    `<p style="margin:0;font-size:13px;color:#666;line-height:1.5">${escapeHtml(fallbackLink)}</p>` +
    `</div>`
  );
}

// The magic link (#310). The URL is the credential: it carries the token
// Auth.js verifies, so this email must reach exactly the address typed and
// say nothing that helps anyone else. The link is single-use and expires.
export function magicLinkEmail(input: { url: string; siteHost: string; minutes: number; t: EmailText }): RenderedEmail {
  const { t } = input;
  const lines = [
    t("magicLink.intro", { host: input.siteHost }),
    t("magicLink.expiry", { minutes: input.minutes }),
    t("magicLink.ignore"),
  ];
  return {
    subject: t("magicLink.subject"),
    text: [lines[0], input.url, lines[1], lines[2]].join("\n\n"),
    html: shell(
      lines.map(escapeHtml),
      { href: input.url, label: t("magicLink.button") },
      t("fallbackLink", { url: input.url })
    ),
  };
}

export function memberRemovedEmail(input: {
  removerName: string | null | undefined;
  siteUrl: string;
  t: EmailText;
}): RenderedEmail {
  const { t } = input;
  const name = safeName(input.removerName, t("someone"));
  const lines = [t("memberRemoved.removed", { name }), t("memberRemoved.access"), t("memberRemoved.ask")];
  return {
    subject: t("memberRemoved.subject"),
    text: [lines[0], lines[1], input.siteUrl, lines[2]].join("\n\n"),
    html: shell(
      lines.map(escapeHtml),
      { href: input.siteUrl, label: t("memberRemoved.button") },
      t("fallbackLink", { url: input.siteUrl })
    ),
  };
}

export function householdInvitationEmail(input: {
  inviterName: string | null | undefined;
  invitedEmail: string;
  siteUrl: string;
  expiresAt: Date;
  t: EmailText;
}): RenderedEmail {
  const { t } = input;
  const name = safeName(input.inviterName, t("someone"));
  // ISO, unambiguous in every language and in every reader's time zone.
  const until = input.expiresAt.toISOString().slice(0, 10);
  const lines = [
    t("invitation.invited", { name }),
    t("invitation.signIn", { email: input.invitedEmail, until }),
    t("invitation.ignore"),
  ];
  return {
    subject: t("invitation.subject", { name }),
    text: [...lines.slice(0, 2), input.siteUrl, lines[2]].join("\n\n"),
    html: shell(
      lines.map(escapeHtml),
      { href: input.siteUrl, label: t("invitation.button") },
      t("fallbackLink", { url: input.siteUrl })
    ),
  };
}

// A beta-invite request from the landing page (#301), sent to the owner, not
// to the person who asked. The requester's address is the whole message —
// the owner answers it with `beta-pass.mjs create --email`. It is typed by a
// stranger, so it is escaped like any other untrusted text and kept out of
// the subject.
export function betaRequestEmail(input: { requesterEmail: string; siteUrl: string }): RenderedEmail {
  const lines = [
    `${input.requesterEmail} asked for a Flatpare beta invite.`,
    `To invite them: node scripts/beta-pass.mjs create --email ${input.requesterEmail}`,
    "Every request so far: node scripts/beta-pass.mjs requests",
  ];
  return {
    subject: "New Flatpare beta request",
    text: lines.join("\n\n"),
    html: shell(
      lines.map(escapeHtml),
      { href: input.siteUrl, label: "Open Flatpare" },
      `If the button does not work, open ${input.siteUrl}`
    ),
  };
}
