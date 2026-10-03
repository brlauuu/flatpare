// Public-facing constants for the landing page and metadata (#189).
//
// The canonical origin is configuration, not a hardcoded string, so the
// domain can be registered and pointed at Vercel without a code change.
// Precedence:
//   1. NEXT_PUBLIC_SITE_URL — set this to the real domain in production.
//   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel supplies it; correct for a
//      deployment that has not been given a custom domain yet.
//   3. localhost on the dev port, so `npm run dev` produces usable absolute
//      URLs instead of throwing.
//
// Only used to build absolute URLs for metadata (canonical, Open Graph).
// Nothing in the app routes off it.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3002";
}

export const SITE_URL = resolveSiteUrl();

// Where the source lives. The licence is source-available, NOT open source:
// O'SAASY permits self-hosting and modification but forbids offering it to
// third parties as a competing hosted service. Copy on the landing page must
// not say "open source" — see LICENSE.
export const REPO_URL = "https://github.com/brlauuu/flatpare";

// The privacy claim, verbatim from the spec
// (docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md,
// "The privacy claim, stated exactly"). The spec requires this exact wording
// wherever the encryption is marketed, and forbids claiming "zero-knowledge"
// without the qualification. Exported as a constant so the landing page and
// its test assert on one string rather than two copies that can drift.
export const PRIVACY_CLAIM =
  "We can't read your data. We do process PDFs and addresses in memory when you ask us to, and we never store them.";

// Where "What's changed" and the footer's Changelog link point (#301).
export const RELEASES_URL = `${REPO_URL}/releases`;

// The walkthrough video on the landing page (#301). Null until it is
// recorded: the page then shows a "coming soon" placeholder in its place.
// A link to YouTube, not an embedded player, so the landing page of a
// privacy-first product loads nothing from Google until the visitor clicks.
export const WALKTHROUGH_VIDEO_URL: string | null = null;
export const WALKTHROUGH_DURATION: string | null = null;

// The author credit in the footer.
export const AUTHOR = { name: "brlauuu", url: "https://brlauuu.dev" } as const;
