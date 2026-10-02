# Changelog

Every merged pull request adds a line under **Unreleased**. A release moves
those lines under a version heading and tags that commit. Versions follow
[Semantic Versioning](https://semver.org/): while the beta runs they stay
below 1.0, with a minor bump for a new user-visible capability and a patch
bump for fixes, dependencies and internal work. 1.0.0 is cut when sign-ups
open. See "Versioning and releases" in `AGENTS.md`.

## Unreleased

### Added
- Sign in with a regular email address: a sign-in link is sent to the address, works once and expires in 15 minutes. Available whenever email is configured; the beta gate applies to new addresses exactly as it does to Google. (#310)

### Changed
- The shared-password sign-in for self-hosting is disabled when email is configured, since a real sign-in method then exists. (#310)

## 0.3.0 — 2026-10-02

### Added
- A Household page for every member: who is in, who is invited, the credit balance, key rotation and the locations of interest. Only the owner sees Recompute distances. Settings keeps the personal encryption settings. (#298)
- A removed member is emailed who removed them and that their account is unchanged. (#298)

## 0.2.0 — 2026-10-02

The first tagged version. It names what is live on flatpare.com as of the
2026-09-30 deploy; everything before it shipped untagged.

### Added
- Accounts with Google sign-in, households, and invitations by email address. (#209)
- End-to-end encryption of every apartment, rating and location in the browser, with a passphrase-protected member key, a household data key and a recovery kit. (E2, E3)
- Rotation of the household data key when a member is removed, and silent re-keying of the other devices. (#219)
- A member can leave a household; the owner cannot. (#220)
- One-time CHF 5 purchase of 40 apartment credits through Stripe, granted by the webhook only. (E6)
- A private-beta gate: sign-ups closed by `FLATPARE_PUBLIC_ACCESS`, opened per person by beta-pass links that also grant credits. (#239, #240)
- The remaining apartment credits, shown to every member, orange when low and red at zero, with a link to buy more. (#305)
- Household invitations are emailed to the invitee, and the beta-pass script can email a pass link. Off unless a mail provider is configured. (#300)
- Rate limiting and log scrubbing for the blind proxies that geocode, measure distances, check listings and read PDFs. (E4)
- Per-household member and apartment caps, unset meaning unlimited. (E5)
- A landing page that states the price and the privacy model. (E7)

### Changed
- Credits are one shared pool: any member may add an apartment and any member may buy more. (#294)
- Switching between sections responds at once and no longer re-downloads and re-decrypts the household's data. (#302)

### Fixed
- Topping up credits sent the buyer back to the app before they could pay. (#305)
- The build-time migration on Vercel runs through the app's own preflighted path, so a failure is visible instead of swallowed. (#211)
- An empty invitation id is refused instead of looking up id 0. (#290)
