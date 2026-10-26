# Changelog

Every merged pull request adds a line under **Unreleased**. A release moves
those lines under a version heading and tags that commit. Versions follow
[Semantic Versioning](https://semver.org/): while the beta runs they stay
below 1.0, with a minor bump for a new user-visible capability and a patch
bump for fixes, dependencies and internal work. 1.0.0 is cut when sign-ups
open. See "Versioning and releases" in `AGENTS.md`.

## Unreleased

## 0.20.1 — 2026-10-26

### Fixed
- The apartment tiles are uniform: every tile in the grid is the same height, the rating badge and the short code each keep their own line (a tile without a code keeps the space, so titles line up), a code no longer breaks across two lines, and rent, size and rooms sit along the bottom edge. (#383)

## 0.20.0 — 2026-10-26

### Added
- For people who run Flatpare themselves: when installing, you now choose where the map's streets come from with `FLATPARE_MAPS`, and the Docker container will not start until you do. `openfreemap` works as before. `local` reads a map file you put in the `maps` folder and contacts no outside service at all; `scripts/build-map.sh` makes one for any region, and a ready-made file for Switzerland is available. The hosted site at flatpare.com is unchanged. **If you already run Flatpare with Docker, add `FLATPARE_MAPS=openfreemap` (or `local`) to `.env.local` before updating, or the container will not start.** (#339)

## 0.19.0 — 2026-10-25

### Changed
- An apartment's page no longer shows a small map of its own. "View on map" opens the household map with all your apartments, and that one highlighted. (#384)

## 0.18.1 — 2026-10-25

### Changed
- flatpare.com draws its maps from OpenFreeMap again, as before 0.18.0. Serving the map data ourselves is meant for people who run Flatpare on their own computer, not for the hosted site. This also fixes a blank map for households searching only in towns just across the Swiss border, such as Mulhouse or Konstanz. (#339)

## 0.18.0 — 2026-10-25

### Changed
- In Switzerland, maps now load their streets from flatpare.com itself instead of an outside map service, so no one else learns which part of town you are looking at. Households with an apartment or place outside Switzerland still get their map from OpenFreeMap. The small map on each apartment's page now looks like the map page and follows the light and dark theme. (#339)

## 0.17.0 — 2026-10-24

### Added
- Any member can now download the whole household as a ZIP file from the Household page: apartments, ratings, locations, the original PDFs and a spreadsheet. Because your data is encrypted, this is the only backup anyone can make of it, and the file itself is not encrypted, so keep it private. A household with no apartments yet can import such a file; other people's ratings come along as text in your own comments. (#191)

## 0.16.1 — 2026-10-24

### Changed
- The two original design documents in `prds/` now say at the top that they are superseded, and point to the documents that replaced them. (#206)

## 0.16.0 — 2026-10-24

### Added
- A household can have more than one owner. On the Household page an owner can make any member an owner, and every owner can invite and remove people and renew the household key, so the household keeps working if one owner drops out. An owner can step back to member, or leave, as long as another owner remains. When someone makes a new recovery kit, the other owners are told who made it and when, because their own copy stops working. (#192)

## 0.15.2 — 2026-10-23

### Added
- brlauuu.github.io/flatpare now takes you to flatpare.com. (#325)

## 0.15.1 — 2026-10-22

### Changed
- Checked on the hosted service that two devices saving at the same moment are handled there too, not only on a self-hosted database. Nothing needed to change. (#368)

## 0.15.0 — 2026-10-21

### Added
- The Household page shows each member's key code, eight small pictures, so you can compare codes with each other in person or on a call. If someone's code differs from what they see on their own device, their key may have been swapped and should not be trusted. Your own code is worked out on your device, not taken from the server. (#218)

## 0.14.3 — 2026-10-21

### Fixed
- Adding or reordering places of interest from two devices at the same moment no longer fails with a server error: the second request waits its turn, and a sixth place gets the clear "too many locations" answer. (#225)

## 0.14.2 — 2026-10-21

### Fixed
- The test suite no longer times out intermittently in the encryption tests: they reuse key pairs generated once per run instead of generating a fresh one per test. (#361)

## 0.14.1 — 2026-10-21

### Fixed
- The screenshot tool for translation review (`npm run capture:screens -- <dir> --locale <l>`) now works in every language; it stopped after the landing page in all but English. (#288)

## 0.14.0 — 2026-10-21

### Added
- Reading a listing PDF now understands French, Italian and Spanish listings as well as German and English, and writes the apartment's summary in your language instead of always in English. (#288)

## 0.13.0 — 2026-10-20

### Added
- Emails in German, French, Italian and Spanish: the sign-in link, household invitations and the removal notice go out in the recipient's language when they chose one, otherwise in the sender's. Beta invitations take a language too. (#288)

## 0.12.0 — 2026-10-20

### Added
- The guide in German, French, Italian and Spanish, following the language you chose. (#288)

### Fixed
- The guide sends you to the Household page for places of interest (they moved there from Settings), and says the hosted version is free during the private beta. (#288)

## 0.11.0 — 2026-10-20

### Added
- The landing page in German, French, Italian and Spanish, with the language menu in its navigation. Its privacy statement and every promise about price, recovery and the beta say the same thing in each language. (#288)

## 0.10.0 — 2026-10-20

### Added
- Flatpare speaks German, French, Italian and Spanish as well as English. Pick a language from the globe in the navigation bar; it is remembered on this device and on your account. The first visit follows your browser's language. The landing page, the guide and the emails follow in the next releases. (#288)

## 0.9.3 — 2026-10-20

### Fixed
- Rating cards and the comparison table write the possessive the same way ("Bob's Rating"), and no longer have a "Household member" label left over from before names fell back to the email address. (#205)

## 0.9.2 — 2026-10-20

### Changed
- The landing page's pencil map has more of the hunt on it: mock flats circled around the city with notes ("Flat A · big kitchen", "Flat C · too far?"), a workplace with its commute, a tram line, and a sketch in "What's inside" that ends with the household's decision. (#326)

### Fixed
- The pencil map no longer loses its marks off the edges of the hero: it scaled with the window, so two notes were cut off at 1280px and every mark at 1920px. It now keeps its size and shows on screens 1280px wide and up (it used to start at 1024px, where it ran into the headline). (#326)

## 0.9.1 — 2026-10-17

### Changed
- The landing page has a privacy section that says exactly what we can and cannot see, and which outside services handle a PDF, an address or a listing link when you ask. "Privacy first" links to it. (#323)
- During the beta the landing page shows the price struck through and "Free beta" in its place. (#323)
- A larger view of the comparison grid sits under "What's inside". (#323)
- The app's navigation bar and the sign-in card use the same blue and yellow logo as the landing page. (#323)

### Fixed
- The guide no longer says you can sign in with GitHub; the hosted service offers Google and email links. (#323)

## 0.9.0 — 2026-10-17

### Added
- Set your own name on the Settings page. Until you do, your household sees your email address instead of "Member" or "Household member", so two people without a name can be told apart. (#327)

## 0.8.0 — 2026-10-07

### Added
- A map page showing all your apartments and places on a clean street map, with your marks drawn by hand. Hover or tap a mark to see price, size, rooms and rating; click to open the apartment. The apartments page now links to it. (#330)

### Changed
- The Guide moved from the navigation bar into the menu under your name, so the bar fits on small phones. (#330)

## 0.7.1 — 2026-10-06

### Changed
- Switching between light and dark mode inside the app now works like on the landing page: one button that flips between the two, starting from your system setting. (#335)

## 0.7.0 — 2026-10-04

### Changed
- On flatpare.com, reading a listing PDF now goes through Vercel AI Gateway with zero data retention: neither Vercel nor the model provider keeps what is sent. Self-hosted installs keep using Google Gemini directly unless they opt in. (#333)

## 0.6.0 — 2026-10-03

### Changed
- The whole app now has the landing page's look: blue and white in light mode, black and yellow in dark, square corners, bold frames and the same typefaces. (#324)

### Fixed
- Printing the recovery kit while the app is in dark mode now prints dark text on white paper, without the page header. (#324)

## 0.5.2 — 2026-10-03

### Changed
- The landing page now says the private beta is free, that CHF 5 applies once sign-ups open, and that beta accounts keep their data and credits afterwards. (#322)
- flatpare.com is updated automatically when a new version is released, and only then: each release goes live as one tested unit. (#320, #321)

## 0.5.1 — 2026-10-03

### Changed
- The landing page shows the actual comparison grid, in light and dark, instead of a placeholder. (#301)

### Fixed
- The sort menu on the Apartments and Compare pages shows the chosen option's name ("Price") instead of an internal value ("rentChf"). (#301)

## 0.5.0 — 2026-10-03

### Added
- A redesigned landing page: what Flatpare is at a glance, a place for the walkthrough video, the hosted and self-hosted options side by side, and light and dark themes that follow your system. (#301)
- Ask for a beta invite straight from the landing page: leave your email and the owner is notified. (#301)
- A notice in the header when a new release is out, linking to what changed; it disappears after 30 days or when dismissed. (#301)

### Changed
- Signing in now opens from a "Sign in" button on the landing page. (#301)

### Fixed
- The Flatpare logo on the landing page and sign-in card no longer shows as a broken image for signed-out visitors. (#301)

## 0.4.0 — 2026-10-02

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
