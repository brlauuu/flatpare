<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repo conventions

The knowledge lives in three layers:

1. **This file**, loaded every session: the rules that apply whatever you touch.
2. **`.claude/rules/<area>.md`**, one per area: that area's rules. Claude Code loads one when you read or edit a file matching its `paths:` frontmatter. Other agents: open the area's rule file (index below) before working there.
3. **`docs/agents/<area>.md`**: the reasoning, measurements, issue history and edge cases behind an area's rules. Read it before a non-trivial change in that area.

When you learn something, put the rule in the narrowest layer that is still always seen: here only if it applies across areas, otherwise the area's rule file (check its `paths:` covers the files involved), and the detail in `docs/agents/`. A new area gets both files and a line in the index.

## Recurring rules (stated once, apply everywhere)

- **Unset or empty means unlimited / open / off** for every self-hoster switch (`PROCESS_RATE_LIMIT_PER_HOUR`, `MAX_MEMBERS`, `MAX_APARTMENTS`, `FLATPARE_PUBLIC_ACCESS`, `STRIPE_SECRET_KEY`, `FLATPARE_CREDITS`, `RESEND_API_KEY`, …): `docker compose up` must work unconfigured, and each has a test pinning that. A value that is set but invalid **throws** (`EnvConfigError` via `readOptionalPositiveInt` in `src/lib/env-int.ts`, or the module's own config error) rather than being coerced. Exception: `PARSE_PDF_MAX_BYTES` falls back to its default.
- **Guarded single-statement writes, never `db.transaction`, for caps and counters** (#225): conditional `INSERT ... SELECT ... WHERE count < cap`, guarded `UPDATE ... WHERE uses < max`, `ON CONFLICT` upserts. Parallel libSQL transactions fail with `SQLITE_BUSY`. `db.transaction` retries on busy (`src/lib/db/busy-retry.ts`); use it only for genuinely multi-statement work, and **keep transaction bodies to the database** (no email, no fetch) since a retry repeats them. Do not use the client's busy `timeout` instead — it blocks the only Node thread. Each concurrency rule has an N-way test; keep it.
- **Env vars never reach `"use client"` files.** Server components read them and pass props (`mode`, `limits`, `identity`, `access`, `feedback`, `terms`, the map source…).
- **Nothing user-supplied is ever logged** from process routes, email, feedback or beta requests: log `scrubbedErrorLine(err)` only (`src/lib/log-scrub.ts`), and answer validation failures with a fixed message (zod issues can echo input).
- **Every data route checks membership itself** (`requireMember()`, 404 never 403 for foreign rows), and every new public or unauthenticated path is added to `src/proxy.ts` deliberately. See `auth.md`.
- **Privacy copy must stay true in all five languages, in several places at once**: the landing page's privacy section, the guide (`src/content/guide.<locale>.md`), the terms page (`src/content/terms.<locale>.md`), and in-app notices. A new outbound service, a new stored column about a person, a new count, or a price/refund/beta change means editing all of them together. Never "zero-knowledge" unqualified, never "open source" (licence is O'SAASY, source-available), every price `CHF 5`, no ß in German.
- **UI text** is an ICU message in all five catalogues (`messages/<locale>/`), never concatenated fragments; never `toLocaleString()` without a locale (use `useFormatter()`). Rents go through `useFormatRent`.
- **Colours come from theme tokens, never Tailwind's palette**; never combine `title-*` with `text-*`, `font-*`, `tracking-*` or `leading-*`. See `theme.md`.
- **No emoji in copy**, except where they are the data (key fingerprints).

## Layering (violated from the importing side, so stated here)

- Nothing under `src/lib/` imports `@/components`; nothing under `src/lib` or at `src/` root imports `src/i18n`; `src/locales/` is a leaf.
- `crypto.subtle`, `crypto.getRandomValues` and `hash-wasm` only under `src/lib/crypto/**`; everyone else imports named functions from `@/lib/crypto` (ESLint enforces it). `src/components/crypto` must not import from `src/components/household-data`.
- Pages use `useHouseholdData()`; they never fetch household data or import the codec.
- Only `src/lib/ai-provider.ts` knows the AI backend (never read `GOOGLE_GENERATIVE_AI_API_KEY` or name a model elsewhere). Only `household-map-inner.tsx` and `map-protocols.ts` import `maplibre-gl`.
- Every outbound request on a user's behalf goes through `assertPublicHttpUrl` (`src/lib/safe-url.ts`).

## Stack and dev server

- **Next.js 16** App Router: `src/proxy.ts` is the auth gate (what was `middleware.ts`; don't recreate it), `src/instrumentation.ts` the boot hook (migrations, logs which DB and AI mode are live), API routes in `src/app/api/.../route.ts`. **React 19**, **Tailwind 4**, shadcn/ui in `src/components/ui/`, edited by hand (re-running `npx shadcn add` overwrites the restyle).
- `npm run dev` and `npm run start` listen on **port 3002**. In Docker the server runs on 3000, published on `${PORT:-3002}`.

## Things that touch production or money

- **`npm run dev` writes to a remote Turso database** (`flatpare-dev`, shared state) because `.env.local` sets `TURSO_DATABASE_URL`. Local file: `TURSO_DATABASE_URL= npm run dev`. The `[db]` boot line names the host; never print the URL's query or the token. `scripts/beta-pass.mjs` and `scripts/credit-code.mjs` read `.env.local` too.
- **Migrations run at Vercel build**, so releasing a migration applies it to production.
- **Pushing a `v*` tag deploys to production** (`.github/workflows/deploy.yml`); merges deploy nothing. Vercel's Git integration stays off (previews would migrate production).
- **The hosted deployment's env is part of what the pages promise**: `MAX_MEMBERS=10`, `MAX_APARTMENTS=40`, `AI_PROVIDER=gateway` (zero retention, which the privacy copy depends on), and `STRIPE_WEBHOOK_SECRET` (not set by the integration; without it the deployment takes money and grants nothing). `PROCESS_RATE_LIMIT_PER_HOUR` stays unset by decision (2026-09-16); do not set it or re-raise it without usage data.

## Tests

- **Vitest, not Jest**, in co-located `__tests__/`. CI runs `npm run test:coverage`, `npm run typecheck` (catches type errors in `__tests__/`, which `next build` skips) and lint.
- **Coverage floors** (lines/statements 80, functions 78, branches 75) apply to every `src/**/*.{ts,tsx}` file, so an untested new file fails CI. Do not add exclusions.
- How to write them (timeouts, banned shapes, fixtures, the per-file database): `tests.md`.

## Versioning and releases — [docs/agents/releases.md](docs/agents/releases.md)

- The version lives in `package.json` (and the lock file's two root fields, edited by hand). **Every merged PR adds a line under `## Unreleased` in `CHANGELOG.md`** (Added / Changed / Fixed, ending with the issue or PR number, written for the user), and is followed by a `release: cut X.Y.Z` PR (minor for new capability or an additive migration, patch otherwise; ask the owner about anything breaking). `/release` follows the steps. 1.0.0 is cut when the beta ends (#232).
- **Exception:** a PR that only touches agent docs (`AGENTS.md`, `.claude/rules/`, `docs/agents/`) gets no changelog line and no release.
- Tag only after the release PR is merged and CI is green.

## Architecture checks (enola) — [docs/agents/enola.md](docs/agents/enola.md)

- Grade structural changes with **`enola check --fail-on=cycles`**; only cycles new against the baseline fail. The baseline accepts one `src`-level module cycle (an SCC membership, not a literal import chain; at file level the graph is acyclic).
- **`.enola/` is gitignored, so the baseline is per-machine**: pin (`enola baseline pin`) before trusting a PASS on a fresh clone or after a deliberate structural change. CI does not run enola.
- enola misses file-level cycles inside one directory; `no-import-cycle.test.ts` guards the crypto screens instead.
- Advisory findings (complexity, fan-in, file length) are reported, not failed. Record new ones in the detail file for the owner to accept or act on; the accepted list and every re-pin's intended layering are there.

## Area index

Each area has a rule file in `.claude/rules/` and a detail file of the same name in `docs/agents/`.

| Area | Rule file | Covers |
|---|---|---|
| Database | `database.md` | Drizzle/libSQL, migrations and preflights, encryption-mode stamp |
| Tests | `tests.md` | per-file DB, `asyncUtilTimeout`, banned shapes, E2E, key pool |
| Auth | `auth.md` | Auth.js v5, providers, 24h JWT, proxy allow-list, `requireMember` |
| Encryption (E2) | `encryption.md` | crypto layering, state machine, pinned vectors, rotation |
| Data (E3) | `data.md` | envelopes, AAD, adding a field, versions, rents, short codes |
| Drafts, retired | `drafts.md` | `adoptDrafts` leftovers |
| Blind proxies (E4) | `blind-proxies.md` | `/api/process/*`, rate-limit order, no-leak |
| Entitlements (E5) | `entitlements.md` | `MAX_MEMBERS`, `MAX_APARTMENTS`, enforcement points |
| Household and Settings | `household-and-settings.md` | what goes where, Recompute visibility |
| Co-owners | `co-owners.md` | at-least-one-owner, recovery kit |
| Export and import | `export-import.md` | versioned format, empty household only |
| Languages | `languages.md` | next-intl, locale order, catalogues, guide in five languages |
| Display names | `display-names.md` | fallback rule, read from the DB |
| Navigation | `navigation.md` | the one `(app)` layout, no async section layouts |
| Landing page (E7) | `landing-page.md` | copy rules and their tests, the one plan |
| Public access and beta passes | `public-access-and-beta-passes.md` | closed sign-ups, passes |
| Terms page | `terms-page.md` | operator vars, notice before a change of substance |
| Email | `email.md` | when it is on, what an email may contain, caps |
| Apartment credits (E6) | `apartment-credits.md` | billing vs counting, codes, webhook, Stripe |
| Processing and credits | `processing-and-credits.md` | first processing spends, 402, usage counts |
| PWA | `pwa.md` | manifest, share target, the stash |
| AI provider | `ai-provider.md` | Google vs gateway |
| Theme | `theme.md` | tokens, frame vs dense, `tailwind-merge` |
| Map page | `map-page.md` | MapLibre loading, coverage |
| Self-hosted map data | `self-hosted-maps.md` | `FLATPARE_MAPS`, Planetiler |
| File uploads | `file-uploads.md` | encrypted PDFs, Blob path, 4.5 MB |
| Cloud-mode env vars | `env-vars.md` | every key and its default |
| Dependencies | `dependencies.md` | what not to upgrade, audit |
