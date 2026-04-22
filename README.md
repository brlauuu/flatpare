# Flatpare

Collaborative apartment comparison tool for small groups hunting for rentals together. Upload PDF listings, extract data with AI, rate apartments, and compare them side-by-side.

## Features

- **PDF Upload & AI Parsing** — Upload apartment listing PDFs; AI extracts structured data (rent, size, rooms, address, etc.)
- **Auto Distance Calculation** — Bike and transit travel time from Basel SBB
- **Star Ratings** — Each user rates apartments on 5 categories (kitchen, balconies, location, floorplan, overall feeling)
- **Comparison Grid** — All apartments in a horizontally scrollable table with best-value highlighting
- **Simple Auth** — Shared password gate + display name (no accounts needed)
- **Mobile-Friendly** — Responsive design with bottom nav on mobile
- **Cloud or Local** — Deploy to Vercel or run fully self-hosted with free alternatives

## Tech Stack

| Layer | Cloud (Vercel) | Local/Self-hosted |
|-------|---------------|-------------------|
| Framework | Next.js 16 (App Router) | Same |
| Database | SQLite via [Turso](https://turso.tech) | Local SQLite file |
| ORM | [Drizzle ORM](https://orm.drizzle.team) | Same |
| Styling | Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) | Same |
| File Storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) | Local filesystem |
| PDF Parsing | [Vercel AI SDK](https://sdk.vercel.ai) + Google Gemini | Ollama (local LLM) or manual entry |
| Distance API | Google Maps Distance Matrix | [OpenRouteService](https://openrouteservice.org) (free) or manual entry |
| Deployment | [Vercel](https://vercel.com) | Any Node.js host |

## Prerequisites

### Cloud mode (Vercel)

- Node.js 20+
- A [Turso](https://turso.tech) account (free tier)
- A [Google AI Studio](https://aistudio.google.com) API key
- (Optional) A [Google Maps Platform](https://console.cloud.google.com) API key

### Local/self-hosted mode

- Node.js 20+
- (Optional) [Ollama](https://ollama.com) with a vision model (e.g. `llava`) for PDF parsing
- (Optional) A free [OpenRouteService](https://openrouteservice.org/dev/#/signup) API key for distance calculation

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd flatpare
npm install
```

### 2. Create a Turso database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Sign up or log in
turso auth signup   # or: turso auth login

# Create the database
turso db create flatpare

# Get connection URL
turso db show flatpare --url
# Output: libsql://flatpare-<yourname>.turso.io

# Create auth token
turso db tokens create flatpare
# Output: <long token string>
```

### 3. Get a Google Generative AI API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **Create API Key**
3. Select or create a Google Cloud project
4. Copy the key

### 4. (Optional) Get a Google Maps API key

Only needed for automatic bike/transit distance calculation from Basel SBB. Without it, users can enter distances manually.

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis)
2. Enable the **Distance Matrix API**
3. Go to **Credentials** > **Create Credentials** > **API Key**
4. Restrict the key to the Distance Matrix API (recommended)

### 5. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
APP_PASSWORD=<choose a shared password>
TURSO_DATABASE_URL=libsql://flatpare-<yourname>.turso.io
TURSO_AUTH_TOKEN=<token from step 2>
GOOGLE_GENERATIVE_AI_API_KEY=<key from step 3>
GOOGLE_MAPS_API_KEY=<key from step 4, or leave empty>
```

`BLOB_READ_WRITE_TOKEN` is only needed in production (Vercel adds it automatically when you connect a Blob store).

### 6. Push database schema

```bash
npx drizzle-kit push
```

### 7. Run locally

```bash
npm run dev
```

Open [http://localhost:3002](http://localhost:3002).

## Local/Self-Hosted Setup (No Cloud Services)

Run Flatpare entirely on your machine with zero cloud dependencies. The only required env var is `APP_PASSWORD`.

### 1. Clone and install

```bash
git clone <repo-url>
cd flatpare
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` — only `APP_PASSWORD` is required:

```env
APP_PASSWORD=<choose a shared password>
```

All cloud variables (`TURSO_DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, etc.) can be omitted. The app auto-detects local mode when they're absent.

### 3. (Optional) Set up Ollama for AI-powered PDF parsing

Without an AI provider, PDF upload still works but all fields must be filled in manually.

```bash
# Install Ollama: https://ollama.com/download
ollama pull llava
ollama serve  # starts on port 11434
```

Add to `.env.local`:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llava
```

### 4. (Optional) Set up OpenRouteService for distance calculation

Without a distance API, users can enter bike/transit times manually.

1. Sign up at [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup) (free, no credit card)
2. Create an API key

Add to `.env.local`:

```env
OPENROUTESERVICE_API_KEY=<your key>
```

Note: OpenRouteService supports bike routing but not public transit. Transit times will need to be entered manually.

### 5. Push database schema and run

```bash
npx drizzle-kit push   # creates ./data/flatpare.db
npm run dev
```

Data is stored in `./data/flatpare.db` (SQLite) and uploaded PDFs go to `./uploads/`. Both directories are gitignored.

## Docker

The simplest way to run Flatpare locally or on a server.

### Quick start

```bash
cp .env.example .env.local
# Edit .env.local — at minimum set APP_PASSWORD

docker compose up -d
```

The app is available at `http://localhost:3002`. To use a different port:

```bash
PORT=8080 docker compose up -d
```

Data (SQLite database and uploaded PDFs) is persisted in Docker volumes.

### With Ollama (AI-powered PDF parsing)

If you're running Ollama on the host machine, add to `.env.local`:

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llava
```

### Rebuild after updates

```bash
git pull
docker compose build
docker compose up -d
```

## Deploy to Vercel

The app is configured for automatic deployment on push to `main`.

### First-time setup

1. Import the repo in [Vercel](https://vercel.com/new)
2. Add environment variables in **Project Settings > Environment Variables**:

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `APP_PASSWORD` | Yes | Shared access password |
   | `TURSO_DATABASE_URL` | Yes | `libsql://...` URL from Turso |
   | `TURSO_AUTH_TOKEN` | Yes | Auth token from Turso |
   | `BLOB_READ_WRITE_TOKEN` | Yes | Auto-added when you connect Vercel Blob storage |
   | `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | For PDF parsing |
   | `GOOGLE_MAPS_API_KEY` | No | For auto distance calculation |

3. Connect a **Blob store**: Project dashboard > **Storage** > **Create** > **Blob**
4. Push the database schema before first use:
   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit push
   ```

### Subsequent deploys

Push to `main` and Vercel deploys automatically.

## Project Structure

```
src/
  app/
    page.tsx                    # Login (password gate)
    apartments/
      page.tsx                  # Apartment list
      new/page.tsx              # PDF upload & parse
      [id]/page.tsx             # Apartment detail & ratings
    compare/
      page.tsx                  # Comparison grid
    costs/
      page.tsx                  # API cost dashboard
    guide/
      page.tsx                  # In-app user guide (rendered from markdown)
    api/
      auth/route.ts             # Password verification
      auth/name/route.ts        # Set display name
      auth/users/route.ts       # List users who have rated
      apartments/route.ts       # List & create apartments
      apartments/[id]/route.ts  # Get, update, delete apartment
      apartments/[id]/ratings/  # Upsert rating
      parse-pdf/route.ts        # PDF upload & AI extraction
      distance/route.ts         # Distance calculation
      costs/route.ts            # API usage cost estimates
  components/                   # UI components (shadcn/ui + custom)
  content/
    guide.md                    # User guide markdown source
  lib/
    db/schema.ts                # Drizzle database schema
    db/index.ts                 # Database client
    auth.ts                     # Cookie/session helpers
    parse-pdf.ts                # AI extraction logic (Gemini / Ollama)
    distance.ts                 # Distance calculation (Google Maps / OpenRouteService)
    storage.ts                  # File storage (Vercel Blob / local filesystem)
  proxy.ts                      # Auth proxy (Next.js 16)
```

## Architecture

### How It Works

1. **Authentication:** A simple shared password gate using HTTP-only cookies. No user accounts — just enter the password and pick a display name. The auth proxy (`proxy.ts`) redirects unauthenticated requests to the login page.

2. **PDF Upload Flow:**
   ```
   User uploads PDF → uploadFile() stores it → extractApartmentData() sends to AI → structured data returned → user reviews & saves
   ```
   The AI provider is selected automatically: Google Gemini if `GOOGLE_GENERATIVE_AI_API_KEY` is set, Ollama if `OLLAMA_BASE_URL` is set, or manual entry if neither.

3. **Distance Calculation:**
   ```
   Apartment address → calculateDistance() → Google Maps (preferred) or OpenRouteService (fallback) → bike & transit minutes
   ```

4. **Rating System:** Each user can rate each apartment once (upsert). Ratings are tied to the display name. Average ratings are computed per apartment for the comparison grid.

5. **Data Storage:** SQLite via Drizzle ORM. In cloud mode, the database lives on Turso; locally, it's a file at `./data/flatpare.db`. File uploads go to Vercel Blob (cloud) or `./uploads/` (local).

### Database Schema

Three tables:

- **apartments** — Core listing data (name, address, size, rent, distances, PDF URL)
- **ratings** — Per-user ratings across 5 categories, with unique constraint on (apartmentId, userName)
- **api_usage** — Tracks API calls to Gemini and Google Maps for the cost dashboard

### API Routes

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

### Environment Variables

| Variable | Required | Mode | Description |
|----------|----------|------|-------------|
| `APP_PASSWORD` | Yes | All | Shared access password |
| `TURSO_DATABASE_URL` | No | Cloud | Turso database URL |
| `TURSO_AUTH_TOKEN` | No | Cloud | Turso auth token |
| `BLOB_READ_WRITE_TOKEN` | No | Cloud | Vercel Blob token (auto-set on Vercel) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Cloud | Google Gemini API key for PDF parsing |
| `GOOGLE_MAPS_API_KEY` | No | Cloud | Google Maps for distance calculation |
| `OLLAMA_BASE_URL` | No | Local | Ollama server URL (e.g. `http://localhost:11434`) |
| `OLLAMA_MODEL` | No | Local | Ollama model name (default: `llava`) |
| `OPENROUTESERVICE_API_KEY` | No | Local | Free distance calculation alternative |
| `DISABLE_SECURE_COOKIES` | No | Local | Set to bypass secure cookie flag in dev |

## Testing

Tests use [Vitest](https://vitest.dev/) with React Testing Library.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Test files live alongside their source in `__tests__/` directories:
- `src/lib/__tests__/` — Unit tests for auth, distance, parse-pdf, storage, utils
- `src/app/api/__tests__/` — API route handler tests
- `src/components/__tests__/` — Component rendering and interaction tests

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm test` to ensure all tests pass
4. Run `npm run lint` to check for lint errors
5. Submit a pull request

## License

See [LICENSE](LICENSE).
