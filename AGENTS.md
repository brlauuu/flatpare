<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repo conventions

This file holds the rules that apply to every change. **Each section links to a file in `docs/agents/` with the full reference** — the reasoning, measurements, issue history and edge cases. Read that file before working in its area; it is not loaded automatically. When you learn something new, put the rule here (one or two lines) and the detail in the matching `docs/agents/` file.

## Recurring rules (stated once, apply everywhere)

- **Unset or empty means unlimited / open / off** for every self-hoster switch (`PROCESS_RATE_LIMIT_PER_HOUR`, `MAX_MEMBERS`, `MAX_APARTMENTS`, `FLATPARE_PUBLIC_ACCESS`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, …): `docker compose up` must work unconfigured, and each has a test pinning that. A value that is set but invalid **throws** (`EnvConfigError` via `readOptionalPositiveInt` in `src/lib/env-int.ts`, or the module's own config error) rather than being coerced. Exception: `PARSE_PDF_MAX_BYTES` falls back to its default.
- **Guarded single-statement writes, never `db.transaction`, for caps and counters** (#225): conditional `INSERT ... SELECT ... WHERE count < cap`, guarded `UPDATE ... WHERE uses < max`, `ON CONFLICT` upserts. Parallel libSQL transactions fail with `SQLITE_BUSY`. `db.transaction` retries on busy (`src/lib/db/busy-retry.ts`); use it only for genuinely multi-statement work, and **keep transaction bodies to the database** (no email, no fetch) since a retry repeats them. Do not use the client's busy `timeout` instead — it blocks the only Node thread. Each concurrency rule has an N-way test; keep it.
- **Env vars never reach `"use client"` files.** Server components read them and pass props (`mode`, `limits`, `identity`, `access`, `feedback`, `terms`, the map source…).
- **Nothing user-supplied is ever logged** from process routes, email, feedback or beta requests: log `scrubbedErrorLine(err)` only (`src/lib/log-scrub.ts`), and answer validation failures with a fixed message (zod issues can echo input).
- **Privacy copy must stay true in all five languages, in several places at once**: the landing page's privacy section, the guide (`src/content/guide.<locale>.md`), the terms page (`src/content/terms.<locale>.md`), and in-app notices. A new outbound service, a new stored column about a person, a new count, or a price/refund/beta change means editing all of them together. Never "zero-knowledge" unqualified, never "open source" (licence is O'SAASY, source-available), every price `CHF 5`, no ß in German.
- **No emoji in copy**, except where they are the data (key fingerprints).
- **Every merged PR gets a changelog line and a release** (see Versioning).

## Stack
- **Next.js 16** App Router. Files to be aware of:
  - `src/proxy.ts` — auth gate (this is what was `middleware.ts` before Next.js 16; don't recreate `middleware.ts`).
  - `src/instrumentation.ts` — boot-time hook (runs DB migrations, logs which DB and AI mode are live).
  - API routes live under `src/app/api/.../route.ts` (route handlers, not pages).
- **React 19**, **Tailwind 4**, shadcn/ui (generated components in `src/components/ui/`, edited by hand — re-running `npx shadcn add` overwrites the restyle).

## Dev server
- `npm run dev` and `npm run start` listen on **port 3002** (not the Next.js default 3000); both scripts pass `-p 3002`.
- In Docker the container's Next.js server runs on **3000**; `docker-compose.yml` publishes it on `${PORT:-3002}`.

## Database — [docs/agents/database.md](docs/agents/database.md)
- **Drizzle ORM** over **libSQL**: schemas in `src/lib/db/schema.ts`, migrations in `drizzle/`, scripts `db:generate`, `db:migrate`, `db:push`, `db:studio`.
- **`npm run dev` writes to a remote Turso database** (`flatpare-dev`, shared state) because `.env.local` sets `TURSO_DATABASE_URL`; the target is decided by its *truthiness* (`resolveDbTarget`, `src/lib/db/target.ts`). Local file: `TURSO_DATABASE_URL= npm run dev`. The `[db]` boot line names the host; never print the URL's query or the token.
- **Migrations run at boot and at Vercel build** (`scripts/vercel-build.mjs` → `scripts/migrate.ts` → `runMigrations`, with the preflights). Releasing a migration applies it to production. Preflights in `src/lib/db/migrate.ts` throw actionable errors instead of letting a migration fail opaquely (old plaintext tables holding rows, duplicate user emails, unset encryption mode on a non-empty DB).
- **Encryption mode is stamped into `settings` on first boot** and boot fails if `FLATPARE_ENCRYPTION` later disagrees; a non-empty DB with the mode unset refuses to pick one. Changing mode means a fresh database (or export/import).
- Every migration's purpose and preflight is listed in the detail file. New empty tables need no preflight; say so in the detail file when you add one.

## Tests — [docs/agents/tests.md](docs/agents/tests.md)
- **Vitest, not Jest.** Config `vitest.config.mts`; tests in co-located `__tests__/`. `npm test`, `npm run test:watch`; CI runs `npm run test:coverage`, `npm run typecheck` (catches type errors in `__tests__/`, which `next build` skips) and lint.
- **Each test file gets its own database**, copied from a template migrated once (`src/test-global-setup.ts`, `src/test-setup.ts`). Do not key it on `VITEST_WORKER_ID`; globalSetup uses `applyMigrations`, not `runMigrations`.
- **`asyncUtilTimeout` stays at 1000ms. If a test flakes, do not raise it** — find what the assertion races. Banned shapes: waiting on the DOM while asserting on a value set in a `useEffect`; `getByRole` on anything that opens asynchronously (use `findByRole`); `findBy*` for things that appear after IndexedDB calls (await the page's own calls, as `share-intake.test.tsx` does); typing long values (paste them).
- **Coverage floors** (lines/statements 80, functions 78, branches 75) apply to every `src/**/*.{ts,tsx}` file, so an untested new file counts. Exclusions are fixed (shadcn `ui/`, `schema.ts`, the test harness, `src/types/**`, `*.d.ts`, `__tests__/`); do not add more, and do not reach for `coverage.all`.
- **E2E (`e2e/`, Playwright, real Stripe test API) is not in `npm test` or CI**; specs skip without a `sk_test_` key. Read `e2e/README.md` before adding one.
- Test key pairs come from the pool (`takeMemberKeypair()`), never the RSA generator.

## Auth — [docs/agents/auth.md](docs/agents/auth.md)
- **Auth.js v5** (`next-auth@5.0.0-beta`) in `src/auth.ts`, real accounts in `users`/`accounts`/`sessions` via the Drizzle adapter. Providers are chosen from env at boot: OAuth (Google/GitHub), magic link (`resend`, whenever email is on; links expire in 15 minutes), and the shared-password credentials provider **only when no OAuth client ID is set and email is off**. `enabledProviderIds` tells `src/app/page.tsx` which buttons to render.
- **JWT sessions capped at 24h**, deliberately: `householdId`/`role` are stamped at sign-in and not re-resolved per request. Destructive and create handlers re-check membership in the database.
- **`src/proxy.ts` is the primary gate**; `/api/auth/*` is allow-listed wholesale (gating part of it breaks sign-in). Every new public asset or unauthenticated route must be added to the matcher or allow-list deliberately — the detail file lists them and why.
- **Route handlers check again**: data routes use `requireMember()` (`src/lib/api-route.ts`), which re-reads membership and answers **404, never 403**, for foreign rows. Crypto, invitation and household routes use `requireHousehold()` (`src/lib/session.ts`). Only the three no-household invitation routes read `auth()` directly.
- `session.householdId` and `role` are nullable (pending invitation). `unstable_update({})` re-resolves them; the client then does a full navigation.
- **Footguns**: setting an OAuth `CLIENT_ID` without its `SECRET` breaks all sign-in; callback URLs must be registered with the provider before deploying. Security limits and accepted advisories live in `docs/security-notes.md`.

## Encryption (E2) — [docs/agents/encryption.md](docs/agents/encryption.md)
- `FLATPARE_ENCRYPTION=on|off`, read only by `readEncryptionMode()` server-side; unset is `on`.
- **Layering, enforced by ESLint**: `crypto.subtle`, `crypto.getRandomValues` and `hash-wasm` only under `src/lib/crypto/**`; everyone else imports named functions from `@/lib/crypto` (no submodule imports). `src/lib/crypto` imports nothing from the app except a type.
- `src/components/crypto/flows.ts` is the only place that sequences crypto with fetch. `CryptoProvider` derives the state machine (`off | needs-setup | pending-wrap | needs-household-key | locked | unlocked`); **adding a screen means adding it to `no-import-cycle.test.ts`**. Under the signed-in layout, `unlocked` guarantees `keys.dataKey`.
- **Pinned vectors**: Argon2id parameters (`kdf.test.ts`) and the fingerprint emoji order (`fingerprint.test.ts`). Changing either changes users' derived values; do it on purpose. Argon2id runs in `kdf-worker.ts` — keep the literal `new Worker(new URL("./kdf-worker.ts", import.meta.url), { type: "module" })` shape.
- **Your own fingerprint comes from `StoredKeys.publicKey`, never the server's copy.**
- **Rotation (#219)**: the server refuses envelopes not sealed under the current `key_version` (`requireCurrentKey`, 409 `Stale key`). Rotation is one all-or-nothing transaction (`rotateHouseholdKey`) driven from `src/components/household-data/rotation.ts`, and mints a new recovery kit. `src/components/crypto` must not import from `src/components/household-data`.

## Data (E3) — [docs/agents/data.md](docs/agents/data.md)
- Tables `apartments`, `ratings`, `locations` hold an opaque `envelope` (`{v:1,iv,ct}` or `{v:0,data}`); **the server never parses it**, only checks its version matches the mode. Everything user-supplied is inside it; only ids, `household_id`, timestamps, `version`, `sort_order` and rating keys are plaintext.
- **Adding a field** = type + zod schema with a default + `emptyApartment()` in `src/lib/household-data/`; no migration.
- AAD is `"<householdId>:<table>:<rowId>"`. A row that fails to open decodes to `null` and renders as **corrupt**, never a crash. Ids are client-minted UUIDs.
- **Layering**: `src/lib/household-data` imports only `@/lib/crypto`; `src/components/household-data` is the only place combining codec and `fetch`; pages use `useHouseholdData()` and never fetch household data or import the codec; routes get wire types through `src/lib/data-rows.ts`. Nothing under `src/lib/` imports `@/components`.
- Apartments carry `version` (409 `Stale version`, the store retries once); ratings and locations are last-write-wins. Sorting, search, averages are derived in the browser.
- **Rents are never converted between currencies**, and every rent on screen goes through `useFormatRent`. The short code is rebuilt inside the write (`syncShortCode`); letter uniqueness is checked in the browser. `addedBy` lives in the envelope, never a column.
- Page tests use `renderWithHouseholdData` from `fake-household-data.tsx` and assert on its `vi.fn()` write methods, never on `fetch`.

## Drafts, retired — [docs/agents/drafts.md](docs/agents/drafts.md)
- Nothing creates drafts any more (#413): links become unprocessed apartments. `adoptDrafts` converts leftovers after each load; rotation still re-seals them. A shared link wins over a PDF's link.

## Blind proxies (E4) — [docs/agents/blind-proxies.md](docs/agents/blind-proxies.md)
- **`/api/process/*` routes are blind proxies**: plaintext in, third-party result out, nothing stored except the usage counter (and the credit tables when billing is on). This is the documented privacy exception; each route says so in its header comment.
- `consumeRateLimit` runs right after `requireMember()`, **before** the outbound call, and counts every call even with no limit set.
- **Never log an error's message, stack or cause from a process route** (outbound URLs carry addresses and API keys).
- **Every outbound request on a user's behalf goes through `assertPublicHttpUrl`** (`src/lib/safe-url.ts`), which re-validates every redirect hop.
- `no-leak.test.ts` covers all routes; its serializer expands Errors on purpose — keep it.
- Listing search uses Google's grounding only; do not swap in Perplexity, Exa or Parallel on the hosted deployment (no zero-retention terms).

## Entitlements (E5) — [docs/agents/entitlements.md](docs/agents/entitlements.md)
- `MAX_MEMBERS`, `MAX_APARTMENTS` via `readLimits()`. **No tier dimension**: `households.tier` is read by nothing; adding a `householdId` argument to `readLimits()` would reverse that decision.
- Enforced server-side in `createApartmentRow` (atomic conditional insert), `createInvitation` (members **plus pending invitations**, a courtesy check) and **`acceptInvitation`, the real enforcement point**.
- UI counters render only when a limit is configured, with tests for their absence.

## Household page and Settings (#298) — [docs/agents/household-and-settings.md](docs/agents/household-and-settings.md)
- `/household` is the group (members, invitations, credits, rotation, locations); `/settings` is the person. Every member may edit locations; only owners see Recompute (UI only — the distance route must stay open to every member). Role is read from `household_members`, not the token.

## Co-owners (#192) — [docs/agents/co-owners.md](docs/agents/co-owners.md)
- Any number of equal owners. **"At least one owner" is a condition inside the statement** that demotes/removes/leaves, never a count read first. `setMemberRole` runs in `db.transaction` on purpose (busy retry). `households.owner_id` is the creator and is read by nothing.
- One recovery kit per household; making a new one notifies the other owners. Any member holding the data key can wrap it for a pending member.

## Export and import (#191) — [docs/agents/export-import.md](docs/agents/export-import.md)
- All in the browser (`export-format.ts` pure, `export-import.ts` ZIP and posts). The format is versioned (`EXPORT_VERSION`); changing the shape of a JSON file means a new version and a reader for the old one. Import only into an empty household, makes no outside call, spends no credit, counts against `MAX_APARTMENTS`.

## Languages (#288) — [docs/agents/languages.md](docs/agents/languages.md)
- Five languages via `next-intl` **without i18n routing** (no locale in URLs). Locale: cookie → `users.locale` → `Accept-Language` → English.
- **`src/locales/` is a leaf; nothing under `src/lib` or at `src/` root may import `src/i18n`** (module cycle).
- **Never concatenate translated fragments; never call `toLocaleString()` without a locale.** Use ICU messages and `useFormatter()`. Pure modules take text objects from the caller. Swiss conventions (`de-CH`…), informal address, no ß.
- A new namespace goes in `NAMESPACES`, `global.d.ts` and every locale; `catalogues.test.ts` enforces parity. Tests render the real English catalogue; `setTestLocale("de")` for language tests.
- Server-sent error text is shown as sent. **A change to the English guide is a change to all five** (`guide-locales.test.tsx`). Keep the German PDF-extraction patterns.

## Display names (#327) — [docs/agents/display-names.md](docs/agents/display-names.md)
- `displayName(name, email)` is the one fallback rule. **The name shown is read from the database, never the session** (the JWT is up to 24h stale). `parseDisplayName` caps at 60 and refuses control characters.

## Navigation and the signed-in shell (#302) — [docs/agents/navigation.md](docs/agents/navigation.md)
- Every signed-in section lives in `src/app/(app)/` under **one** layout, the only one that awaits `auth()` and mounts `NavBar`, `CryptoGate` and `HouseholdDataProvider`.
- **Do not add an `async` layout or a provider to a section** (`signed-in-layouts.test.tsx` fails on it). A page that must not require an unlocked key (like `/billing`) goes outside `(app)`.
- `src/app/(app)/loading.tsx` is what makes navigation feel instant. The store refreshes in the background on a section switch and drops the refresh if a write committed meanwhile.

## Landing page (E7) — [docs/agents/landing-page.md](docs/agents/landing-page.md)
- `/` (`src/app/page.tsx` + `src/app/_components/landing.tsx`); words in `messages/<locale>/landing.json`. **Copy rules are enforced by `landing.test.tsx` and `landing-locales.test.tsx`**: `PRIVACY_CLAIM` verbatim, every `DISCLOSURES` entry rendered, one price, no unqualified zero-knowledge, no open source. Read the detail file before editing.
- The privacy section (`#privacy`) names every third party that sees plaintext. It does not name Vercel AI Gateway, but its zero-retention claim depends on `AI_PROVIDER=gateway`.
- **One plan: CHF 5 once, 10 people, 40 apartments processed (a lifetime quota)**; the hosted deployment must set `MAX_MEMBERS=10` and `MAX_APARTMENTS=40`, or the page becomes false. Change the numbers, the tests and the env together.
- Re-run `npm run build && npm run capture:hero` whenever the comparison grid's look changes. No prices in the hero sketches. `SITE_URL` makes the domain configuration.

## Public access gate and beta passes (#239, #240) — [docs/agents/public-access-and-beta-passes.md](docs/agents/public-access-and-beta-passes.md)
- `FLATPARE_PUBLIC_ACCESS=closed` closes **sign-ups, not sign-ins**. Enforced in Auth.js's `signIn` callback (`decideSignUp`, `src/lib/sign-up-gate.ts`), not the proxy. Admitted while closed: existing accounts, a usable beta pass cookie, a pending invitation.
- Beta passes are the one door and the one free-credit mechanism. A use is consumed when a pass admits a new account (open or closed), by a guarded update. Revocation stops the link, never the people; nothing granted is clawed back. Credits land on the tester's first own household (stamp, then grant).
- Mint with `node scripts/beta-pass.mjs` — it reads `.env.local`, so it touches the remote DB unless the URL is cleared. No admin UI.

## Terms page (#474) — [docs/agents/terms-page.md](docs/agents/terms-page.md)
- `/terms` from `src/content/terms.<locale>.md`; English is binding. **No page and no link unless all three operator vars are set** (`readOperator`), so self-hosted copies never name the flatpare.com operator. Keep it true (see the recurring privacy rule); a change of substance needs a one-time notice in the signed-in layout first.

## Email (#300) — [docs/agents/email.md](docs/agents/email.md)
- **Off unless `RESEND_API_KEY` and a sender resolve** (`emailEnabled()`); turning it on also enables magic links and removes the shared password.
- `src/lib/email.ts` is a leaf using plain `fetch`; `scripts/beta-pass.mjs` makes the identical call — change both together.
- **What an email may contain is a privacy decision**: invitations never carry the household name; anonymous feedback carries only message, version and language; beta-invite addresses are not stored. Display names are attacker-chosen (`safeName`, `escapeHtml`).
- **A failed send never undoes anything**; routes report `emailed: "sent" | "failed" | "off"`. `sendEmail` logs status or error class only. Per-day caps: invitations 20 per household, feedback 100 and beta requests 50 site-wide.

## Apartment credits (E6) — [docs/agents/apartment-credits.md](docs/agents/apartment-credits.md)
- **Billing is off unless `STRIPE_SECRET_KEY` is set**; off means no paywall and no counting.
- Credits are **one shared household pool**: no role check and no per-member budget on spending or buying (decided on #294).
- Two ceilings: `MAX_APARTMENTS` (rows held) and credits (processings ever paid for; `apartments_ever_added` is monotonic, never decremented by delete).
- **`POST /api/billing/webhook` is the only thing that grants credits.** It is unauthenticated by design: read the raw body (`req.text()`), verify the signature first, never mock `constructEvent` in tests. Idempotency is the `payments` primary key (Stripe event id), inserted before granting.
- **The purchase gate keys on `granted === 0`, never `remaining === 0`** — a household that spent its credits still owns its data.
- Stripe: `mode: "payment"`, inline `price_data` (`PRICE_CHF_CENTS` in `src/lib/stripe.ts`), **`ui_mode: "embedded_page"`, not `"embedded"`**. The checkout polls for `granted > grantedAtStart`.
- No rate limit on the hosted deployment, by decision (2026-09-16): an accepted cost, not an oversight. Do not set `PROCESS_RATE_LIMIT_PER_HOUR` or re-raise it without usage data.

## Processing and credits (#413) — [docs/agents/processing-and-credits.md](docs/agents/processing-and-credits.md)
- **Creating an apartment is free; its first processing (PDF read or geocode) spends the credit**, keyed by the `apartmentId` the request names (`chargeFirstProcessing`: claim, then guarded spend). Reprocess and Recompute all cost one credit each; distances never charge.
- **The client names the apartment only on its first processing**, so the app never spends on its own. **A changed address is not geocoded again** (that would be a free reprocess, decided against); a PDF never overwrites what a member entered (`fillFromExtraction`).
- Out of credit (402) is not an error: the apartment stays unprocessed and `ProcessingNotice` says so. Buttons say what they cost only when billing is on.
- Usage counts (`process_usage`, `credit_spends`) are per household, never per member; `scripts/usage-report.mjs` reports them. **People are told in four places, plus the terms page** — change all of them with a new count. The scheduled report workflow runs on a public repo: it prints no counts, ids or errors and uploads no artifact.

## PWA — [docs/agents/pwa.md](docs/agents/pwa.md)
- The manifest is `src/app/manifest.ts`; its colours must match `globals.css` (`manifest.test.ts`). Browsers fetch the manifest and icons without credentials, so they stay outside the proxy.
- **`public/sw.js` only receives shares** (`POST /share-target`) and caches nothing. Its stash layout is duplicated in `src/lib/share-stash.ts`; the test fails if they drift.
- **Nothing in the share stash is acted on without the person's tap** (any site can forge a POST to `/share-target`). Intake waits for `status === "ready"`. Sign-out clears the stash. The no-worker route never reads the body.
- Android does not honour `file_handlers`; do not claim it does in the guide.

## AI provider (#333) — [docs/agents/ai-provider.md](docs/agents/ai-provider.md)
- **`src/lib/ai-provider.ts` is the only place that knows the AI backend**; never read `GOOGLE_GENERATIVE_AI_API_KEY` or name a model elsewhere. Google by default; `gateway` demands zero data retention per request and fails closed. **The hosted deployment runs `AI_PROVIDER=gateway`** and the privacy copy depends on it.

## Theme (#324) — [docs/agents/theme.md](docs/agents/theme.md)
- One palette in `src/app/globals.css`; **colours come from tokens, never Tailwind's palette** (map style excepted). `theme-contrast.test.ts` enforces contrast in both themes and print.
- Frame (3px border + hard shadow) vs dense (1px, no shadow); fields take `weight`.
- **Never combine `title-*` with `text-*`, `font-*`, `tracking-*` or `leading-*`**. New theme utilities that overlap a Tailwind group go in `extendTailwindMerge` in `src/lib/utils.ts`. Focus rings at full strength.

## Map page (#330) — [docs/agents/map-page.md](docs/agents/map-page.md)
- MapLibre on `/map`; **only `household-map-inner.tsx` and `map-protocols.ts` import `maplibre-gl`**, loaded with `next/dynamic` (`ssr: false`). The inner stays counted at 0% coverage; logic belongs in tested `src/lib/map/` modules. No buildings, house numbers or POIs in the style. Guide sits in the user menu because the phone nav bar is full.

## Self-hosted map data (#339) — [docs/agents/self-hosted-maps.md](docs/agents/self-hosted-maps.md)
- `FLATPARE_MAPS=openfreemap|local`; unset in the app = OpenFreeMap, but the Docker entrypoint refuses to start until it is set. **`local` never contacts an outside service** and never falls back to OpenFreeMap. flatpare.com serves no map data. Keep Planetiler's pinned digest and layers in sync with `style.ts`.

## Architecture checks (enola) — [docs/agents/enola.md](docs/agents/enola.md)
- Grade structural changes with **`enola check --fail-on=cycles`**; only cycles new against the baseline fail. The baseline accepts one `src`-level module cycle (an SCC membership, not a literal import chain; at file level the graph is acyclic).
- **`.enola/` is gitignored, so the baseline is per-machine**: pin (`enola baseline pin`) before trusting a PASS on a fresh clone or after a deliberate structural change. CI does not run enola.
- enola misses file-level cycles inside one directory; `no-import-cycle.test.ts` guards the crypto screens instead.
- Advisory findings (complexity, fan-in, file length) are reported, not failed. Record new ones in the detail file for the owner to accept or act on; the accepted list and every re-pin's intended layering are there.

## File uploads — [docs/agents/file-uploads.md](docs/agents/file-uploads.md)
- **PDFs are encrypted in the browser before upload** and stored as `application/octet-stream`; the server never learns whether a file is encrypted. Files over about 4.5 MB must use the Vercel Blob path (`uploadEncryptedFile` probes for it).
- **A PDF is read only in memory** (`/api/process/parse-pdf`); the read is capped at 4.5 MB on Vercel. By decision: no trimming in the browser, no plaintext upload to Blob to get around it.
- Replacing a file uploads under a new revision name, points the row at it, then deletes the old file — Blob refuses to overwrite, and a row must never point at bytes it cannot open.

## Cloud-mode env vars — [docs/agents/env-vars.md](docs/agents/env-vars.md)
- Every feature key degrades cleanly when unset. The full list, with defaults and what the hosted deployment sets, is in the detail file. **`STRIPE_WEBHOOK_SECRET` is not set by the integration**; without it the deployment takes money and grants nothing.

## Versioning and releases — [docs/agents/releases.md](docs/agents/releases.md)
- The version lives in `package.json` (and the lock file's two root fields, edited by hand). **Every merged PR adds a line under `## Unreleased` in `CHANGELOG.md`** (Added / Changed / Fixed, ending with the issue or PR number, written for the user), and is followed by a `release: cut X.Y.Z` PR (minor for new capability or an additive migration, patch otherwise; ask the owner about anything breaking). `/release` follows the steps. 1.0.0 is cut when the beta ends (#232).
- **Pushing a `v*` tag deploys to production** (`.github/workflows/deploy.yml`); merges deploy nothing. Tag only after the release PR is merged and CI is green. Vercel's Git integration stays off (previews would migrate production).

## Dependency maintenance — [docs/agents/dependencies.md](docs/agents/dependencies.md)
- **Do not "fix" `npm outdated`** for `next-auth` (v5 is on the `beta` tag) or `typescript` (stays on 6 for `typescript-eslint`).
- `@types/node` tracks the Node runtime (24), not npm's latest. `npm audit fix` needs npm 11 (`npx npm@11`). Audit acceptances live in `docs/security-notes.md`.
