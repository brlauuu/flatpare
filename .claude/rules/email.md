---
paths:
  - "src/lib/{email,email-templates,household-email,feedback,feedback-limits,beta-requests}.ts"
  - "src/app/api/feedback/**"
  - "src/app/api/beta-requests/**"
  - "src/app/api/invitations/**"
  - "scripts/beta-pass.mjs"
  - "src/components/feedback-dialog.tsx"
---

# Email (#300)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/email.md](../../docs/agents/email.md); read it before a non-trivial change here.

- **Off unless `RESEND_API_KEY` and a sender resolve** (`emailEnabled()`); turning it on also enables magic links and removes the shared password.
- `src/lib/email.ts` is a leaf using plain `fetch`; `scripts/beta-pass.mjs` makes the identical call — change both together.
- **What an email may contain is a privacy decision**: invitations never carry the household name; anonymous feedback carries only message, version and language; beta-invite addresses are not stored. Display names are attacker-chosen (`safeName`, `escapeHtml`).
- **A failed send never undoes anything**; routes report `emailed: "sent" | "failed" | "off"`. `sendEmail` logs status or error class only. Per-day caps: invitations 20 per household, feedback 100 and beta requests 50 site-wide.
