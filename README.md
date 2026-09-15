<p align="center">
  <img src="public/flatpare_logo.svg" alt="Flatpare" width="420" />
</p>

<p align="center">
  <strong>Compare apartments side-by-side without spreadsheets.</strong><br/>
  Upload PDF listings, let AI pull out the numbers, rate places together with your household, see which one is the best deal at a glance — with the data encrypted in your browser before it ever reaches the server.
</p>

<p align="center">
  <a href="https://github.com/brlauuu/flatpare/actions/workflows/test.yml"><img alt="CI" src="https://github.com/brlauuu/flatpare/actions/workflows/test.yml/badge.svg" /></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript 6" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind 4" src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black" />
  <img alt="Vitest 5" src="https://img.shields.io/badge/Vitest-5-6E9F18?logo=vitest&logoColor=white" />
  <img alt="Node 24" src="https://img.shields.io/badge/Node-24-339933?logo=nodedotjs&logoColor=white" />
</p>

<p align="center">
  <em>Add a screenshot or short GIF of the apartments overview / compare page here once you have one — it sells the rest of the README.</em>
</p>

---

## What you get

| | |
|---|---|
| 🔐 **Encrypted in your browser** | Every apartment, rating, location and uploaded PDF is sealed with AES-256-GCM under a key only your household holds. The server stores ciphertext it cannot read. |
| 📄 **PDF → structured data** | Drop in a Swiss listing PDF, Gemini extracts rent, size, rooms, address, summary. Edits you make are preserved across re-parses. |
| ⭐ **Per-user star ratings** | Each member rates kitchen, balconies, location, floorplan and overall. Averages roll up automatically — computed in the browser, since the server cannot read the scores. |
| 📊 **Comparison grid** | Sortable side-by-side table — best price, biggest, shortest commute — with hide/show per apartment. |
| 🚲 **Auto distance** | Bike + transit minutes from each apartment to your "locations of interest" (work, schools, family). |
| 🗺️ **Map view** | Apartments overview map and a per-apartment pin, rendered client-side with [Leaflet](https://leafletjs.com). |
| 👥 **Households + invitations** | Invite people by email; each member gets their own account and their own copy of the household key. |
| ☁️ **Cloud or self-hosted** | One repo runs on Vercel + Turso + Vercel Blob, or fully self-hosted with SQLite + local disk and no third-party accounts at all. |

## How the encryption works

This is the part that shapes everything else in the codebase, so it is worth 60 seconds.

- **Keys are derived and held in your browser.** A passphrase you choose derives an Argon2id key that wraps an RSA-OAEP-3072 private key; one AES-256-GCM household data key is wrapped to each member's public key. Stored keys live in IndexedDB as non-extractable `CryptoKey`s. The server stores wrapped blobs and never sees the passphrase.
- **Rows are envelopes.** `apartments`, `ratings` and `locations` each hold one `envelope` column of ciphertext. Names, addresses, rent, coordinates, distances, rating scores and comments all live *inside* it. Only what the server needs to scope and order rows stays in the clear: ids, `household_id`, timestamps, `version`, sort order.
- **You get a recovery kit.** A 25-character code wraps a second copy of the data key. Lose your passphrase without it and the data is gone — there is no reset, by design.
- **One deliberate exception, and it is not hidden.** Geocoding, distance lookup, listing checks and PDF extraction cannot be done in the browser, so `/api/process/*` acts as a blind proxy: plaintext goes in, a third-party result comes out, nothing is written to any table. The server sees one address, one URL or one PDF per call, in memory. We therefore do **not** describe Flatpare as zero-knowledge — that claim would be false.
- **Encryption can be turned off** with `FLATPARE_ENCRYPTION=off` for a self-hosted install that does not want key management. The choice is stamped into the database on first boot and cannot be changed afterwards without starting fresh.

Accepted limits and the full threat model are in [`docs/security-notes.md`](./docs/security-notes.md).

## Tech stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** App Router (Server Components + Route Handlers) |
| Language | **TypeScript 6**, **React 19** |
| Styling | **Tailwind CSS 4**, [shadcn/ui](https://ui.shadcn.com) |
| Database | [**Drizzle ORM**](https://orm.drizzle.team) over libSQL — Turso (cloud) or local SQLite |
| Crypto | WebCrypto (AES-256-GCM, RSA-OAEP-3072) + [hash-wasm](https://github.com/Daninet/hash-wasm) Argon2id |
| Auth | [Auth.js v5](https://authjs.dev) — Google / GitHub OAuth, or a shared password when self-hosting |
| File storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (cloud) or `./uploads/` (local) — ciphertext either way |
| AI | [Vercel AI SDK](https://sdk.vercel.ai) + Google Gemini 2.5 Flash |
| Maps | Google Maps (Geocoding + Distance Matrix) with [OpenRouteService](https://openrouteservice.org) bike-distance fallback; [Leaflet](https://leafletjs.com) for rendering |
| Payments | [Stripe](https://stripe.com) embedded Checkout — one-time, optional, off unless configured |
| Tests | **Vitest 5** + React Testing Library, coverage floors enforced in CI |
| Deploy target | Vercel (preferred) or any Node 24+ host |

## Quickstart

```bash
cp .env.example .env.local        # set AUTH_SECRET + APP_PASSWORD at minimum
docker compose up -d
```

Open <http://localhost:3002>, sign in with the password you set, and choose an encryption passphrase when prompted. That is the whole local path — SQLite, filesystem uploads, manual entry, no cloud accounts and no billing.

> **Port note:** the container listens on **3000**; `docker-compose.yml` publishes that to host port **3002**. Override the host side with `PORT=8080 docker compose up -d`. The container side is fixed.

## Running without Docker

```bash
git clone https://github.com/brlauuu/flatpare.git
cd flatpare
npm install
cp .env.example .env.local        # set AUTH_SECRET + APP_PASSWORD
npm run db:push                   # creates ./data/flatpare.db
npm run dev                       # http://localhost:3002
```

Drizzle migrations also run automatically at boot via `src/instrumentation.ts`, so a first-time `npm run dev` is usually enough on its own.

> **`npm run dev` follows `TURSO_DATABASE_URL`.** If `.env.local` sets it, the dev server writes to that cloud database, not to `./data/flatpare.db`. Run `TURSO_DATABASE_URL= npm run dev` to force the local file. The app prints which one it picked at boot, and warns when a non-production build is pointed at the cloud.

<details>
<summary><strong>Cloud mode — Turso + Gemini, run locally</strong></summary>

**Prerequisites:** Node 24 LTS, a [Turso](https://turso.tech) database, a [Google AI Studio](https://aistudio.google.com) key, and (optional) a Google Maps Platform key.

```bash
# Turso DB
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create flatpare
turso db show flatpare --url     # libsql://...
turso db tokens create flatpare  # token
```

Get a Gemini key at <https://aistudio.google.com/apikey>. For Maps Platform enable **Geocoding API** and **Distance Matrix API** in [Google Cloud Console](https://console.cloud.google.com/apis) — see [docs/google-apis.md](./docs/google-apis.md). The Maps Embed API is *not* needed; maps are rendered with Leaflet.

Configure `.env.local`:

```env
AUTH_SECRET=<generate with: npx auth secret>
APP_PASSWORD=<shared password>
TURSO_DATABASE_URL=libsql://flatpare-<you>.turso.io
TURSO_AUTH_TOKEN=<token>
GOOGLE_GENERATIVE_AI_API_KEY=<key>
GOOGLE_MAPS_API_KEY=<key, or omit>
```

Then:

```bash
npx drizzle-kit push
npm run dev
```

`BLOB_READ_WRITE_TOKEN` is only needed in production (Vercel adds it automatically).
</details>

<details>
<summary><strong>Optional: OpenRouteService for bike distance</strong></summary>

Free, no credit card required. Sign up at [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup) and add to `.env.local`:

```env
OPENROUTESERVICE_API_KEY=<key>
```

Transit isn't supported — enter those minutes manually if you need them.
</details>

## Deploying to Vercel

1. Import the repo in [Vercel](https://vercel.com/new).
2. **Project Settings → Environment Variables** — see the [Configuration](#configuration) table below for the full list. At minimum: `AUTH_SECRET`, an OAuth pair, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GOOGLE_GENERATIVE_AI_API_KEY`.

   **Register OAuth callback URLs with Google and GitHub before deploying** — for the production domain *and* every Vercel preview URL. Nothing fails locally to warn you if this is skipped; the first production sign-in just fails at the provider's redirect.

3. **Storage → Create → Blob** to provision the blob store.
4. Push the schema once before first use:

   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit push
   ```

5. Subsequent pushes to `main` deploy automatically. The `vercel-build` script runs the migration step inside the build.

> ### ⚠️ Upgrading an existing database
>
> Several migrations cannot run against a populated database, and migrations execute at boot (`src/instrumentation.ts`), so **the app will not start** until the situation is resolved. Preflight checks in `src/lib/db/migrate.ts` catch each case and abort atomically with an actionable message rather than failing opaquely — existing data is untouched, just unreachable until you act.
>
> - **0011** adds a `NOT NULL household_id` to the pre-accounts data tables, which SQLite only permits on empty tables.
> - **0013** stamps `FLATPARE_ENCRYPTION` into the database permanently. If `apartments` already holds rows and the variable is unset, boot fails and asks you to choose explicitly — `off` keeps existing rows readable, `on` starts encrypting and makes them unreadable to a later release. **The choice cannot be changed afterwards** without a fresh database.
> - **0014** drops the plaintext data tables and replaces them with encrypted envelope tables. There is no data migration: a pre-encryption database must be emptied by hand first.
> - **0015** adds a unique index on `users.email` and refuses to run if duplicates already exist, naming them — they cannot be merged automatically, since each owns a separate household.
>
> For a hosted deployment, wipe the database **before** deploying, not after: deploying first means the very first request triggers the failed boot-time migration.
>
> Known gap: `scripts/vercel-build.mjs` runs `drizzle-kit migrate` at build time and bypasses these runtime preflights ([#211](https://github.com/brlauuu/flatpare/issues/211)).

## Configuration

All env vars live in `.env.local` (loaded by Next.js) or your Vercel project settings. [`.env.example`](./.env.example) is the annotated source of truth.

### Core

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | yes | Auth.js session encryption key — generate with `npx auth secret`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes* | Google OAuth. Set **both** or neither — a CLIENT_ID with no CLIENT_SECRET registers a broken provider *and* disables the password fallback, locking everyone out. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | yes* | GitHub OAuth. Same both-or-neither rule. |
| `APP_PASSWORD` | yes* | Shared password for the self-host credentials provider — registered only when **no** OAuth `_CLIENT_ID` is set. |
| `FLATPARE_ENCRYPTION` | optional | `on` (default when unset) or `off`. Stamped into the database on first boot; changing it later means a fresh database. |

\* Exactly one auth path is required: `AUTH_SECRET` + a Google or GitHub OAuth pair (hosted), or `AUTH_SECRET` + `APP_PASSWORD` with no OAuth vars set (self-host). There is no `DISABLE_SECURE_COOKIES` var — `@auth/core` derives the session cookie's `Secure` flag from the request protocol, so plain-HTTP self-hosting works with no config.

### Storage

| Variable | Required | Description |
|---|---|---|
| `TURSO_DATABASE_URL` | cloud | Turso database URL. **Truthiness of this variable decides which database is live**; unset (or explicitly empty) falls back to the local SQLite file. |
| `TURSO_AUTH_TOKEN` | cloud | Turso auth token. |
| `BLOB_READ_WRITE_TOKEN` | cloud | Vercel Blob token (auto-set by Vercel). Unset falls back to `./uploads/`. |
| `LOCAL_DB_URL` | optional | Override the SQLite path (defaults to `file:./data/flatpare.db`). |

### Third-party processing

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | optional | Gemini 2.5 Flash for PDF extraction. Without it, manual entry only. |
| `GOOGLE_MAPS_API_KEY` | optional | Geocoding + Distance Matrix. |
| `OPENROUTESERVICE_API_KEY` | optional | Bike-distance fallback when the Maps key is unset. |
| `PARSE_PDF_MAX_BYTES` | optional | Upload ceiling for PDF extraction. Defaults to 20 MB (Gemini's inline-file limit). |

### Limits — **unset means unlimited**

Every ceiling is opt-in, because a self-hoster spends their own resources. There is no tier dimension: these apply to every household. Anything that is not a positive integer fails loudly rather than being coerced.

| Variable | Description |
|---|---|
| `PROCESS_RATE_LIMIT_PER_HOUR` | Per-household hourly ceiling on **each** `/api/process/*` endpoint. A hosted deployment wants a value here — these endpoints spend the host's Gemini and Maps budget. |
| `MAX_MEMBERS` | Members per household. |
| `MAX_APARTMENTS` | Apartments a household may hold at once. |

> The hosted deployment sets `MAX_MEMBERS=10` and `MAX_APARTMENTS=40` — that is what the landing page sells. Leaving them unset there silently grants paying customers unlimited use and makes the pricing copy untrue.

### Billing — **off unless `STRIPE_SECRET_KEY` is set**

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Enables billing. Unset (the self-host default) means no paywall, no quota enforcement, and `apartments_ever_added` is never incremented — so switching billing on later does not bill anyone for their history. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client key for embedded Checkout. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/billing/webhook`. **Not** injected by the Vercel integration — create the endpoint in the Stripe dashboard and copy it. The webhook is the only thing that grants credits, so a deployment missing this takes money and grants nothing. |

### Public site

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for metadata (canonical, Open Graph, Twitter). Falls back to Vercel's production URL, then `http://localhost:3002`. Nothing routes off it. |

## Auth model

Flatpare uses **Auth.js v5** (`src/auth.ts`) with real per-user accounts, backed by the `users` / `accounts` / `sessions` tables.

- **Two provider paths**, chosen at boot from env vars: **OAuth (Google / GitHub)** when a `_CLIENT_ID` is set — the hosted path — or a **shared-password credentials provider** when neither is set, so `docker compose up` works with zero third-party setup. The password path is never registered once OAuth is configured, so it cannot become a back door.
- **Sessions are JWTs capped at 24h**, deliberately short of the library's 30-day default: a member removed from a household keeps read access until their token expires, so the window is bounded and small. Destructive, bulk and create handlers re-check membership against the database rather than trusting the token.
- **`src/proxy.ts` is the primary gate** (Next.js 16's replacement for `middleware.ts`), requiring both a user id and a household on the session. `/api/auth/*` is allow-listed wholesale — Auth.js owns that namespace end to end. `POST /api/billing/webhook` is allow-listed too and is the one endpoint unauthenticated by design: Stripe has no session, so its signature is its only authentication.
- **Route handlers are the second line.** `requireMember()` (`src/lib/api-route.ts`) re-checks membership against `household_members` on every data request, reads included, and answers `404` rather than `403` for a foreign row — a `403` would confirm the row exists in someone else's household.

Full detail, including the JWT staleness reasoning and accepted advisories, lives in [`docs/security-notes.md`](./docs/security-notes.md) and [`AGENTS.md`](./AGENTS.md).

## Billing

Optional, and entirely absent unless `STRIPE_SECRET_KEY` is set.

- **One plan: CHF 5, once.** A one-time payment via Stripe embedded Checkout (`mode: "payment"`), never a subscription. The amount lives in `src/lib/stripe.ts` beside the copy that advertises it.
- **It buys 40 apartment credits.** A credit is spent when an apartment is *added* and is never refunded by a delete — adding is what costs money (an extraction, a geocode, distance lookups) while holding costs a few hundred bytes of ciphertext. Another CHF 5 adds another 40.
- **The webhook is the only thing that grants credits** — not the checkout route, not the client, not a redirect. Idempotency is the `payments` primary key, which is the Stripe event id, so a redelivery is a no-op rather than a second grant.
- **Running out of credits means "no new apartments", never "no access".** The purchase gate keys on *never having bought*, not on *having spent* — a household that paid and used its credits still owns its apartments, and under end-to-end encryption nobody could undo a lockout.

## Project layout

```
src/
  app/
    page.tsx                      # Landing page (marketing + sign-in)
    _components/landing.tsx       # Landing copy — see AGENTS.md before editing
    login-form.tsx                # Client-side sign-in form
    apartments/                   # List view, [id] detail, new/ upload+parse+review
    compare/                      # Side-by-side comparison grid
    settings/                     # Household, members, encryption, locations of interest
    invitations/                  # Accept / decline (for users without a household)
    billing/                      # Embedded Stripe Checkout (outside the crypto gate)
    guide/                        # In-app user guide (renders src/content/guide.md)
    api/                          # Route handlers — see API surface below
  components/
    crypto/                       # Setup / unlock / recovery screens + CryptoProvider
    household-data/               # The client store: codec + fetch + provider
    ui/                           # shadcn/ui primitives
  content/guide.md                # User guide source
  lib/
    crypto/                       # KDF, envelopes, key wrapping, device key store
    household-data/               # Plaintext types, schemas, wire rows, codec, derivation
    db/                           # Drizzle schema, client, migration runner + preflights
    api-route.ts                  # requireMember(), parseBody(), apiErrorResponse()
    session.ts                    # requireHousehold() — session + tenant-scope check
    household.ts                  # assertMembership(), UnauthorizedError, ForbiddenError
    billing.ts, stripe.ts         # Credits ledger, Stripe client + price
    rate-limit.ts, safe-url.ts    # Blind-proxy hardening
    limits.ts, env-int.ts         # Entitlement caps
    parse-pdf.ts, geocode.ts      # Third-party integrations
    distance.ts, storage.ts       # ...
  auth.ts                         # Auth.js v5 config — providers, JWT session, household claims
  instrumentation.ts              # Boot hook — runs Drizzle migrations
  proxy.ts                        # Auth gate (Next.js 16 renamed middleware.ts)
drizzle/                          # SQL migrations
docs/                             # google-apis.md, security-notes.md
```

## API surface

The three data routes — apartments, ratings and locations — are `requireMember()` → validate → work, and answer `404` for unknown *and* foreign rows. The crypto, invitation and household routes use `requireHousehold()` instead; the three invitation routes marked below run for a signed-in user who has no household yet.

| Method | Endpoint | Description |
|---|---|---|
| `*` | `/api/auth/*` | Auth.js — sign-in, OAuth callback, session, CSRF (owned by `next-auth`, not app code) |
| `GET` `POST` | `/api/apartments` | List / create (encrypted envelopes) |
| `PUT` `DELETE` | `/api/apartments/[id]` | Update (optimistic-concurrency `version`) / delete |
| `PUT` `DELETE` | `/api/apartments/[id]/ratings/me` | Upsert / clear **your own** rating — the only rating writes |
| `GET` | `/api/ratings` | All ratings in the household |
| `GET` `POST` | `/api/locations` | List / create locations of interest (max 5) |
| `PUT` `DELETE` | `/api/locations/[id]` | Update / delete |
| `POST` | `/api/locations/[id]/move` | Reorder |
| `GET` | `/api/crypto/status` | Key state — the one crypto route that answers when encryption is off |
| `POST` | `/api/crypto/setup` | Create the member key pair + household data key |
| `PUT` `POST` | `/api/crypto/member-keys`, `/api/crypto/wraps` | Publish a public key / wrap the data key to a member |
| `POST` | `/api/crypto/member-keys/reset` | Re-key a member |
| `GET` | `/api/crypto/pending-wraps` | Members awaiting a wrap |
| `PUT` `POST` | `/api/crypto/recovery`, `/api/crypto/recover` | Regenerate / redeem the recovery kit |
| `GET` `POST` | `/api/invitations` | List / send |
| `DELETE` | `/api/invitations/[id]` | Revoke |
| `POST` | `/api/invitations/[id]/accept` | Accept (no household required) |
| `POST` | `/api/invitations/decline` | Decline (no household required) |
| `GET` | `/api/invitations/mine` | Invitations addressed to you (no household required) |
| `GET` | `/api/household/members` | Household roster |
| `DELETE` | `/api/household/members/[userId]` | Remove a member |
| `POST` | `/api/process/parse-pdf` | Blind proxy — PDF in, extracted fields out |
| `POST` | `/api/process/geocode` | Blind proxy — address in, coordinates out |
| `POST` | `/api/process/distance` | Blind proxy — two points in, minutes out |
| `POST` | `/api/process/check-listing` | Blind proxy — URL in, alive/expired out |
| `POST` | `/api/files` | Multipart upload of an encrypted PDF (local-disk fallback path) |
| `GET` `POST` | `/api/files/upload-token` | Issue Vercel Blob client-upload tokens (large files) |
| `GET` | `/api/pdf/[...path]` | Stream ciphertext from Blob to a member |
| `GET` | `/api/uploads/[...path]` | Stream ciphertext from local disk to a member |
| `POST` | `/api/billing/checkout` | Create an embedded Checkout session |
| `GET` | `/api/billing/status` | Credits granted / remaining |
| `POST` | `/api/billing/webhook` | Stripe events — **unauthenticated by design**, signature-verified |

The `/api/process/*` routes never write to any table (the one exception is the rate-limit counter, which holds no request content). That is the privacy exception described under [How the encryption works](#how-the-encryption-works).

## Testing

```bash
npm test             # one-shot
npm run test:watch   # watch mode
npm run test:coverage  # what CI runs
npm run lint
npm run typecheck
```

[Vitest](https://vitest.dev/) + React Testing Library. Tests live next to their source in colocated `__tests__/` directories, and each test *file* runs against its own copy of a pre-migrated database, in parallel.

CI fails if coverage drops below the floors in `vitest.config.ts`: **lines ≥ 80 %, statements ≥ 80 %, functions ≥ 78 %, branches ≥ 75 %**. Those floors apply to every source file, not only the ones a test imports — a wholly untested new file counts against the average.

## Database

```bash
npm run db:generate   # author a new migration
npm run db:push       # push the schema directly (dev convenience)
npm run db:migrate    # apply pending migrations
npm run db:studio     # browser-based DB inspector
```

Schemas in `src/lib/db/schema.ts`, migrations in `drizzle/`. The runner in `src/lib/db/migrate.ts` is invoked automatically by `src/instrumentation.ts` at server start, and carries the preflight checks described under [Upgrading an existing database](#deploying-to-vercel).

## Docker

```bash
docker compose up -d            # default — host 3002 → container 3000
PORT=8080 docker compose up -d  # different host port

# Rebuild after pulling updates
git pull
docker compose build
docker compose up -d
```

Data persists in two named volumes: `flatpare-data` (SQLite database) and `flatpare-uploads` (encrypted PDFs).

## Contributing

1. Branch from `main`.
2. Make changes; keep tests green (`npm test`), lint clean (`npm run lint`) and types clean (`npm run typecheck`).
3. Open a pull request; `main` is protected and all PRs run the test workflow.

The repo uses Vitest, Drizzle, and Next 16-specific conventions, and several of them are load-bearing in ways a linter will not tell you about — read [`AGENTS.md`](./AGENTS.md) before touching the proxy, instrumentation, migration, crypto or billing paths. It is terse on purpose and worth the 5-minute scan.

## License

[O'SAASY](./LICENSE) — source-available. Self-hosting and modification are fine; offering Flatpare to third parties as a competing hosted service is not.

## Credits

Flatpare is built and maintained by **[brlauuu](https://github.com/brlauuu)** in collaboration with **[Claude Code](https://claude.com/claude-code)** by [Anthropic](https://www.anthropic.com) — designed, debugged, and refactored together over many evenings.
