<p align="center">
  <img src="public/flatpare_logo.svg" alt="Flatpare" width="420" />
</p>

<p align="center">
  <strong>Compare apartments side-by-side without spreadsheets.</strong><br/>
  Upload PDF listings, let AI pull out the numbers, rate places together with friends, see who's the best deal at a glance.
</p>

<p align="center">
  <a href="https://github.com/brlauuu/flatpare/actions/workflows/test.yml"><img alt="CI" src="https://github.com/brlauuu/flatpare/actions/workflows/test.yml/badge.svg" /></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript 6" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind 4" src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black" />
  <img alt="Vitest 4" src="https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white" />
  <img alt="Node 24" src="https://img.shields.io/badge/Node-24-339933?logo=nodedotjs&logoColor=white" />
</p>

<p align="center">
  <em>Add a screenshot or short GIF of the apartments overview / compare page here once you have one — it sells the rest of the README.</em>
</p>

---

## What you get

| | |
|---|---|
| 📄 **PDF → structured data** | Drop in a Swiss listing PDF, Gemini extracts rent, size, rooms, address, summary. Edits you make are preserved across re-parses. |
| ⭐ **Per-user star ratings** | Each viewer rates kitchen, balconies, location, floorplan, and overall. Averages roll up automatically. |
| 📊 **Comparison grid** | Sortable side-by-side table — best price, biggest, shortest commute — with hide/show per apartment. |
| 🚲 **Auto distance** | Bike + transit minutes from each apartment to user-defined "locations of interest" (work, schools, family). |
| 🗺️ **Map view** | Apartments overview map (Leaflet) plus an embedded Google Map per detail page. |
| 💰 **Cost dashboard** | Tracks Gemini and Maps API usage with monthly cost estimates and a per-service breakdown. |
| 🔐 **Simple auth** | Shared password + display name. No real accounts, no OAuth, no accidents. |
| ☁️ **Cloud or local** | One repo runs on Vercel + Turso + Vercel Blob, or fully self-hosted with SQLite + local disk. |

## Tech stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** App Router (Server Components + Route Handlers) |
| Language | **TypeScript 6**, **React 19** |
| Styling | **Tailwind CSS 4**, [shadcn/ui](https://ui.shadcn.com) |
| Database | [**Drizzle ORM**](https://orm.drizzle.team) over libSQL — Turso (cloud) or local SQLite |
| File storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (cloud) or `./uploads/` (local) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai) + Google Gemini 2.5 Flash |
| Maps | Google Maps (Geocoding + Distance Matrix + Embed) with [OpenRouteService](https://openrouteservice.org) bike-distance fallback |
| Tests | **Vitest 4** + React Testing Library, ~85% line coverage enforced in CI |
| Deploy target | Vercel (preferred) or any Node 24+ host |

## Quickstart

```bash
cp .env.example .env.local        # set APP_PASSWORD at minimum
docker compose up -d
```

Open <http://localhost:3002>. That's it for the local-only path — SQLite + filesystem uploads + manual entry, no cloud accounts required.

> **Port note:** the container listens on **3000**; `docker-compose.yml` publishes that to host port **3002**. Override the host side with `PORT=8080 docker compose up -d`. The container side is fixed.

## Running without Docker

```bash
git clone https://github.com/brlauuu/flatpare.git
cd flatpare
npm install
cp .env.example .env.local        # set APP_PASSWORD
npm run db:push                   # creates ./data/flatpare.db
npm run dev                       # http://localhost:3002
```

Drizzle migrations also run automatically at boot via `src/instrumentation.ts`, so first-time `npm run dev` is enough in most cases.

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

Get a Gemini key at <https://aistudio.google.com/apikey>. For Maps Platform (distances, geocoding, embedded maps) enable **Geocoding API**, **Distance Matrix API**, and **Maps Embed API** in [Google Cloud Console](https://console.cloud.google.com/apis) — see [docs/google-apis.md](./docs/google-apis.md) for full setup.

Configure `.env.local`:

```env
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

Transit isn't supported — enter manually if you need it.
</details>

## Deploying to Vercel

1. Import the repo in [Vercel](https://vercel.com/new).
2. **Project Settings → Environment Variables** — add:

   | Variable | Required | Notes |
   |---|---|---|
   | `APP_PASSWORD` | yes | Shared access password |
   | `TURSO_DATABASE_URL` | yes | `libsql://...` URL from Turso |
   | `TURSO_AUTH_TOKEN` | yes | Auth token from Turso |
   | `BLOB_READ_WRITE_TOKEN` | yes | Auto-added when you connect Vercel Blob |
   | `GOOGLE_GENERATIVE_AI_API_KEY` | yes | Gemini PDF parsing |
   | `GOOGLE_MAPS_API_KEY` | optional | Distances + geocoding + embedded map |

3. **Storage → Create → Blob** to provision the blob store.
4. Push the schema once before first use:

   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit push
   ```

5. Subsequent pushes to `main` deploy automatically. The `vercel-build` script in `package.json` runs the migration step inside the build.

## Configuration

All env vars live in `.env.local` (loaded via Next.js) or your Vercel project settings.

| Variable | Required | Mode | Description |
|---|---|---|---|
| `APP_PASSWORD` | yes | both | Shared access password (env var, **not** the cookie name). |
| `TURSO_DATABASE_URL` | cloud | cloud | Turso database URL. Local mode falls back to a SQLite file. |
| `TURSO_AUTH_TOKEN` | cloud | cloud | Turso auth token. |
| `BLOB_READ_WRITE_TOKEN` | cloud | cloud | Vercel Blob token (auto-set by Vercel). |
| `GOOGLE_GENERATIVE_AI_API_KEY` | optional | both | Without it, manual entry only. |
| `GOOGLE_MAPS_API_KEY` | optional | both | Distances + geocoding + embed. |
| `OPENROUTESERVICE_API_KEY` | optional | both | Bike-distance fallback when Maps key is unset. |
| `LOCAL_DB_URL` | optional | local | Override the SQLite path (defaults to `file:./data/flatpare.db`; tests use `file:./data/test.db`). |
| `DISABLE_SECURE_COOKIES` | optional | dev | Drops the `Secure` flag so cookies survive plain HTTP. |

See [docs/google-apis.md](./docs/google-apis.md) for the Google Maps setup walk-through and [docs/security-notes.md](./docs/security-notes.md) for accepted `npm audit` advisories.

## Auth model

Flatpare uses a deliberately simple shared-password model — no accounts, no OAuth.

- The password lives in the **`APP_PASSWORD` env var**. `verifyPassword(input)` (in `src/lib/auth.ts`) compares the submitted value against it.
- A successful login sets two cookies:
  - **`flatpare-auth=true`** (httpOnly) — `isAuthenticated()` checks this.
  - **`flatpare-name=<display name>`** (readable from client JS) — `getDisplayName()` reads this.
- API routes return **401** when `isAuthenticated()` is false. There is no `requireUser()` helper — guard explicitly per route.
- `DISABLE_SECURE_COOKIES=true` strips the `Secure` flag so cookies work over plain HTTP in dev.

## Project layout

```
src/
  app/
    page.tsx                      # Login (password gate)
    add-user/page.tsx             # First-run user onboarding
    apartments/
      page.tsx                    # List view (grid + list, sortable, searchable)
      _components/                # ApartmentCard, ApartmentRow, badges
      new/page.tsx                # PDF upload + AI parse + review
      new/_components/            # UploadStep, ReviewStep, SingleEntryStep, StatusBadge
      [id]/page.tsx               # Apartment detail + ratings + edit
      [id]/_components/           # PagerNav, Actions, MetricBadges, DistanceSection
    compare/page.tsx              # Side-by-side comparison grid
    compare/_components/          # CompareTable, CompareColumnHeader
    costs/page.tsx                # API cost dashboard
    guide/page.tsx                # In-app user guide (renders src/content/guide.md)
    settings/page.tsx             # Locations of interest + distance recompute
    api/
      auth/                       # Password, name, users
      apartments/                 # CRUD, ratings, reprocess, listing checks
      parse-pdf/                  # Upload, AI extraction, blob upload tokens
      geocode/backfill/           # Geocode rows missing lat/lng
      locations/                  # Locations of interest CRUD + reorder
      settings/                   # Recompute per-location distances
      pdf/, uploads/              # Authenticated file streaming
      costs/                      # API usage stats
  components/                     # Shared UI (shadcn/ui + custom)
  content/guide.md                # User guide source
  lib/
    db/                           # Drizzle schema, client, migration runner
    auth.ts                       # Cookie helpers + password verifier
    parse-pdf.ts                  # AI extraction (Gemini)
    distance.ts                   # Distance (Maps / ORS)
    geocode.ts                    # Address → lat/lng
    locations.ts                  # Locations of interest helpers
    listing-status.ts             # Detect expired listing URLs
    map-embed.ts                  # Maps embed URL builder
    short-code.ts                 # Apartment short-code generator
    storage.ts                    # File storage (Blob / FS)
    upload-pdf.ts                 # Client-direct Blob upload (>4.5 MB)
  instrumentation.ts              # Boot hook — runs Drizzle migrations
  proxy.ts                        # Auth gate (Next.js 16 renamed middleware.ts)
drizzle/                          # SQL migrations
docs/                             # google-apis.md, security-notes.md
```

## API surface

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth` | Verify password, set auth cookie |
| `POST` | `/api/auth/name` | Set display-name cookie |
| `GET` | `/api/auth/users` | List users |
| `DELETE` | `/api/auth/users/[name]` | Remove a user |
| `GET` / `POST` | `/api/apartments` | List / create |
| `GET` / `PATCH` / `DELETE` | `/api/apartments/[id]` | Get, update, delete |
| `POST` | `/api/apartments/[id]/ratings` | Upsert a rating |
| `POST` | `/api/apartments/[id]/reprocess` | Re-run AI extraction |
| `POST` | `/api/apartments/check-listings` | Probe URLs, mark expired |
| `POST` | `/api/parse-pdf` | Upload PDF (≤ 4.5 MB), store, AI extract |
| `GET` / `POST` | `/api/parse-pdf/upload-token` | Issue Blob client-upload tokens (large PDFs) |
| `GET` | `/api/pdf/[...path]` | Authenticated PDF streaming |
| `GET` | `/api/uploads/[...path]` | Authenticated raw upload streaming |
| `GET` / `POST` | `/api/locations` | List / create locations of interest |
| `GET` / `PUT` / `DELETE` | `/api/locations/[id]` | Get, update, delete |
| `POST` | `/api/locations/[id]/move` | Reorder |
| `POST` | `/api/geocode/backfill` | Geocode rows missing lat/lng |
| `POST` | `/api/settings/recompute-distances` | Recompute all per-location distances |
| `GET` | `/api/costs` | API usage stats + cost estimates |

## Testing

```bash
npm test            # one-shot
npm run test:watch  # watch mode
```

[Vitest](https://vitest.dev/) + React Testing Library. Tests live next to their source in colocated `__tests__/` directories. CI fails if coverage drops below the floor configured in `vitest.config.ts` (lines ≥ 80 %, branches ≥ 75 %, functions ≥ 78 %, statements ≥ 80 %).

## Database

```bash
npm run db:generate   # author a new migration
npm run db:push       # push the schema directly (dev convenience)
npm run db:migrate    # apply pending migrations
npm run db:studio     # browser-based DB inspector
```

Schemas in `src/lib/db/schema.ts`, migrations in `drizzle/`. The runner in `src/lib/db/migrate.ts` is invoked automatically by `src/instrumentation.ts` at server start.

## Docker

```bash
docker compose up -d            # default — host 3002 → container 3000
PORT=8080 docker compose up -d  # different host port

# Rebuild after pulling updates
git pull
docker compose build
docker compose up -d
```

Data persists in two named volumes: `flatpare-data` (SQLite + uploads) and `flatpare-uploads`.

## Contributing

1. Branch from `main`.
2. Make changes; keep tests green (`npm test`) and lint clean (`npm run lint`).
3. Open a pull request; `main` is protected, all PRs run the test workflow.

The repo uses Vitest, Drizzle, and Next 16-specific conventions — read [`AGENTS.md`](./AGENTS.md) before touching the proxy, instrumentation, or migration paths. It's terse on purpose and worth the 5-minute scan.

## License

[MIT](./LICENSE).

## Credits

Flatpare is built and maintained by **[brlauuu](https://github.com/brlauuu)** in collaboration with **[Claude Code](https://claude.com/claude-code)** by [Anthropic](https://www.anthropic.com) — designed, debugged, and refactored together over many evenings.
