<p align="center">
  <img src="public/flatpare_logo.svg" alt="Flatpare" width="420" />
</p>

<p align="center">
  Collaborative apartment comparison tool for small groups hunting for rentals together.<br/>
  Upload PDF listings, extract data with AI, rate apartments, compare side-by-side.
</p>

<p align="center">
  <a href="https://github.com/brlauuu/flatpare/actions/workflows/test.yml"><img alt="CI" src="https://github.com/brlauuu/flatpare/actions/workflows/test.yml/badge.svg" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white" />
</p>

## Features

- **PDF upload & AI parsing** — listings are extracted into structured data (rent, size, rooms, address).
- **Auto distance** — bike and transit travel time from Basel SBB.
- **Star ratings & comparison grid** — each user rates on 5 categories; results show side-by-side.
- **Simple auth** — shared password + display name, no accounts.
- **Cloud or local** — deploy to Vercel, or run fully self-hosted.

## Quick start

```bash
cp .env.example .env.local   # set APP_PASSWORD at minimum
docker compose up -d
```

Open [http://localhost:3002](http://localhost:3002).

For deployment and non-Docker setup, pick a path below.

<details>
<summary><strong>Deploy to Vercel</strong></summary>

1. Import the repo in [Vercel](https://vercel.com/new).
2. Add environment variables in **Project Settings > Environment Variables**:

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `APP_PASSWORD` | Yes | Shared access password |
   | `TURSO_DATABASE_URL` | Yes | `libsql://...` URL from Turso |
   | `TURSO_AUTH_TOKEN` | Yes | Auth token from Turso |
   | `BLOB_READ_WRITE_TOKEN` | Yes | Auto-added when you connect Vercel Blob |
   | `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | PDF parsing |
   | `GOOGLE_MAPS_API_KEY` | No | Auto distance calculation |

3. Connect a **Blob store**: dashboard → **Storage** → **Create** → **Blob**.
4. Push the database schema before first use:
   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit push
   ```

Subsequent pushes to `main` deploy automatically.

</details>

<details>
<summary><strong>Cloud mode — run locally against Turso + Gemini</strong></summary>

**Prerequisites:** Node.js 20+, a [Turso](https://turso.tech) account, a [Google AI Studio](https://aistudio.google.com) API key, optionally a [Google Maps](https://console.cloud.google.com) key.

```bash
git clone <repo-url>
cd flatpare
npm install
```

Create a Turso database:

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create flatpare
turso db show flatpare --url           # libsql://flatpare-<you>.turso.io
turso db tokens create flatpare        # auth token
```

Get a Gemini key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Optionally enable the **Distance Matrix API** in [Google Cloud Console](https://console.cloud.google.com/apis) and create a key.

Configure `.env.local`:

```env
APP_PASSWORD=<shared password>
TURSO_DATABASE_URL=libsql://flatpare-<you>.turso.io
TURSO_AUTH_TOKEN=<token>
GOOGLE_GENERATIVE_AI_API_KEY=<key>
GOOGLE_MAPS_API_KEY=<key, or omit>
```

Push schema and run:

```bash
npx drizzle-kit push
npm run dev
```

`BLOB_READ_WRITE_TOKEN` is only needed in production (Vercel adds it automatically).

</details>

<details>
<summary><strong>Local / self-hosted — no cloud services</strong></summary>

Runs with a local SQLite file, local filesystem storage, and free or no AI. The only required env var is `APP_PASSWORD`.

```bash
git clone <repo-url>
cd flatpare
npm install
cp .env.example .env.local        # set APP_PASSWORD
npx drizzle-kit push              # creates ./data/flatpare.db
npm run dev
```

Data lives in `./data/flatpare.db`; uploaded PDFs go to `./uploads/`. Both are gitignored.

**Optional — OpenRouteService for bike distance**

Sign up at [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup) (free, no credit card). Transit is not supported — enter manually.

```env
OPENROUTESERVICE_API_KEY=<key>
```

</details>

<details>
<summary><strong>Docker details</strong></summary>

The quick-start command above uses `docker compose up -d`. Data is persisted in Docker volumes (`flatpare-data`, `flatpare-uploads`).

Use a different host port:

```bash
PORT=8080 docker compose up -d
```

Rebuild after updates:

```bash
git pull
docker compose build
docker compose up -d
```

</details>

<details>
<summary><strong>Tech stack</strong></summary>

| Layer | Cloud (Vercel) | Local/self-hosted |
|-------|---------------|-------------------|
| Framework | Next.js 16 (App Router) | Same |
| Database | SQLite via [Turso](https://turso.tech) | Local SQLite file |
| ORM | [Drizzle ORM](https://orm.drizzle.team) | Same |
| Styling | Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) | Same |
| File Storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) | Local filesystem |
| PDF Parsing | [Vercel AI SDK](https://sdk.vercel.ai) + Google Gemini | Google Gemini or manual entry |
| Distance API | Google Maps Distance Matrix | [OpenRouteService](https://openrouteservice.org) (free) or manual entry |
| Deployment | [Vercel](https://vercel.com) | Any Node.js host |

</details>

<details>
<summary><strong>Project structure</strong></summary>

```
src/
  app/
    page.tsx                    # Login (password gate)
    apartments/
      page.tsx                  # Apartment list
      new/page.tsx              # PDF upload & parse
      [id]/page.tsx             # Apartment detail & ratings
    compare/page.tsx            # Comparison grid
    costs/page.tsx              # API cost dashboard
    guide/page.tsx              # In-app user guide
    api/
      auth/                     # Password, name, users
      apartments/               # List, create, update, delete, ratings
      parse-pdf/                # PDF upload & AI extraction
      distance/                 # Distance calculation
      costs/                    # API usage cost estimates
  components/                   # UI components (shadcn/ui + custom)
  content/guide.md              # User guide markdown source
  lib/
    db/                         # Drizzle schema + client
    auth.ts                     # Cookie/session helpers
    parse-pdf.ts                # AI extraction (Gemini)
    distance.ts                 # Distance (Google Maps / OpenRouteService)
    storage.ts                  # File storage (Blob / filesystem)
  proxy.ts                      # Auth proxy (Next.js 16)
```

</details>

<details>
<summary><strong>Architecture</strong></summary>

- **Authentication:** shared password gate with HTTP-only cookies; no accounts. The auth proxy (`proxy.ts`) redirects unauthenticated requests.
- **PDF flow:** upload → store → AI extraction → structured data → user reviews & saves. Uses Google Gemini when configured; falls back to manual entry.
- **Distance:** Google Maps preferred, OpenRouteService fallback. Returns bike and transit minutes.
- **Ratings:** one upsert per user per apartment across 5 categories; averages drive the comparison grid.
- **Storage:** Turso or local SQLite for data; Vercel Blob or `./uploads/` for files.

**Tables:** `apartments`, `ratings` (unique on `(apartmentId, userName)`), `api_usage`.

</details>

<details>
<summary><strong>API routes</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth` | Verify password, set auth cookie |
| `POST` | `/api/auth/name` | Set display name cookie |
| `GET` | `/api/auth/users` | List distinct users who have rated |
| `GET` | `/api/apartments` | List all apartments with average ratings |
| `POST` | `/api/apartments` | Create a new apartment |
| `GET` | `/api/apartments/[id]` | Get apartment with all ratings |
| `PATCH` | `/api/apartments/[id]` | Update apartment fields |
| `DELETE` | `/api/apartments/[id]` | Delete apartment and cascade ratings |
| `POST` | `/api/apartments/[id]/ratings` | Upsert a rating for the current user |
| `POST` | `/api/parse-pdf` | Upload PDF, store file, run AI extraction |
| `POST` | `/api/distance` | Calculate bike/transit distance for an address |
| `GET` | `/api/costs` | Get API usage stats and estimated costs |

</details>

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Required | Mode | Description |
|----------|----------|------|-------------|
| `APP_PASSWORD` | Yes | All | Shared access password |
| `TURSO_DATABASE_URL` | No | Cloud | Turso database URL |
| `TURSO_AUTH_TOKEN` | No | Cloud | Turso auth token |
| `BLOB_READ_WRITE_TOKEN` | No | Cloud | Vercel Blob token (auto-set on Vercel) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Cloud | Google Gemini API key for PDF parsing |
| `GOOGLE_MAPS_API_KEY` | No | Cloud | Google Maps for distance calculation |
| `OPENROUTESERVICE_API_KEY` | No | Local | Free distance calculation alternative |
| `DISABLE_SECURE_COOKIES` | No | Local | Set to bypass secure cookie flag in dev |

</details>

## Testing

```bash
npm test          # run once
npm run test:watch
```

Uses [Vitest](https://vitest.dev/) with React Testing Library. Test files live next to their source in `__tests__/` directories.

## Contributing

1. Create a feature branch from `main`.
2. Make changes, run `npm test` and `npm run lint`.
3. Open a pull request.

## License

See [LICENSE](LICENSE).
