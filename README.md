# Flatpare

Collaborative apartment comparison tool for small groups hunting for rentals together. Upload PDF listings, extract data with AI, rate apartments, and compare them side-by-side.

## Features

- **PDF Upload & AI Parsing** — Upload apartment listing PDFs; Gemini extracts structured data (rent, size, rooms, address, etc.)
- **Auto Distance Calculation** — Bike and transit travel time from Basel SBB via Google Maps
- **Star Ratings** — Each user rates apartments on 5 categories (kitchen, balconies, location, floorplan, overall feeling)
- **Comparison Grid** — All apartments in a horizontally scrollable table with best-value highlighting
- **Simple Auth** — Shared password gate + display name (no accounts needed)
- **Mobile-Friendly** — Responsive design with bottom nav on mobile

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database | SQLite via [Turso](https://turso.tech) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Styling | Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) |
| File Storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) |
| PDF Parsing | [Vercel AI SDK](https://sdk.vercel.ai) + Google Gemini |
| Distance API | Google Maps Distance Matrix |
| Deployment | [Vercel](https://vercel.com) |

## Prerequisites

- Node.js 20+
- npm
- A [Turso](https://turso.tech) account (free tier)
- A [Google AI Studio](https://aistudio.google.com) API key
- (Optional) A [Google Maps Platform](https://console.cloud.google.com) API key

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

Open [http://localhost:3000](http://localhost:3000).

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
    api/
      auth/route.ts             # Password verification
      auth/name/route.ts        # Set display name
      apartments/route.ts       # List & create apartments
      apartments/[id]/route.ts  # Get, update, delete apartment
      apartments/[id]/ratings/  # Upsert rating
      parse-pdf/route.ts        # PDF upload & AI extraction
      distance/route.ts         # Google Maps distance lookup
  components/                   # UI components
  lib/
    db/schema.ts                # Drizzle database schema
    db/index.ts                 # Database client
    auth.ts                     # Cookie/session helpers
    parse-pdf.ts                # AI extraction logic
    distance.ts                 # Google Maps API wrapper
  proxy.ts                      # Auth proxy (Next.js 16)
```

## License

See [LICENSE](LICENSE).
