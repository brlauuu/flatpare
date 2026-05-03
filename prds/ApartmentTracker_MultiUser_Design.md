# Flatpare - Technical Specification

**Version:** v3.0
**Date:** May 2026

---

## 1. Purpose

This document describes the technical implementation details for Flatpare: database schema, API routes, PDF parsing strategy, authentication flow, and component architecture. The current schema, routes, and file layout are the source of truth — see `src/lib/db/schema.ts` and `src/app/api/`.

---

## 2. Database Schema (Drizzle ORM + libSQL/SQLite)

Six tables. Source: `src/lib/db/schema.ts`.

### 2.1 `apartments`

```typescript
export const apartments = sqliteTable("apartments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  sizeM2: real("size_m2"),
  numRooms: real("num_rooms"),
  numBathrooms: integer("num_bathrooms"),
  numBalconies: integer("num_balconies"),
  hasWashingMachine: integer("has_washing_machine", { mode: "boolean" }),
  rentChf: real("rent_chf"),
  pdfUrl: text("pdf_url"),
  listingUrl: text("listing_url"),
  shortCode: text("short_code").unique(),
  rawExtractedData: text("raw_extracted_data"),
  userEditedFields: text("user_edited_fields"),
  summary: text("summary"),
  availableFrom: text("available_from"),
  listingGone: integer("listing_gone", { mode: "boolean" }).default(false),
  listingCheckedAt: integer("listing_checked_at", { mode: "timestamp" }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});
```

### 2.2 `ratings`

```typescript
export const ratings = sqliteTable("ratings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  apartmentId: integer("apartment_id").notNull()
    .references(() => apartments.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  kitchen: integer("kitchen").default(0),
  balconies: integer("balconies").default(0),
  location: integer("location").default(0),
  floorplan: integer("floorplan").default(0),
  overallFeeling: integer("overall_feeling").default(0),
  comment: text("comment").default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex("ratings_apartment_user_idx").on(table.apartmentId, table.userName),
]);
```

### 2.3 `users`

```typescript
export const users = sqliteTable("users", {
  name: text("name").primaryKey().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});
```

The user list backs the display-name picker on the add-user page.

### 2.4 `api_usage`

```typescript
export const apiUsage = sqliteTable("api_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  service: text("service").notNull(),     // e.g. "gemini", "google-maps"
  operation: text("operation").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});
```

Powers the `/costs` page.

### 2.5 `locations_of_interest`

```typescript
export const locationsOfInterest = sqliteTable("locations_of_interest", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  address: text("address").notNull(),
  sortOrder: integer("sort_order").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});
```

User-managed reference points for distance calculations.

### 2.6 `apartment_distances`

```typescript
export const apartmentDistances = sqliteTable("apartment_distances", {
  apartmentId: integer("apartment_id").notNull()
    .references(() => apartments.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull()
    .references(() => locationsOfInterest.id, { onDelete: "cascade" }),
  bikeMin: integer("bike_min"),
  transitMin: integer("transit_min"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
}, (table) => [
  primaryKey({ columns: [table.apartmentId, table.locationId] }),
]);
```

Composite primary key: one row per (apartment, location).

### 2.7 Constraints

- One rating per `(apartmentId, userName)` — unique index.
- Ratings cascade-delete when an apartment is deleted.
- Apartment distances cascade-delete when either side is deleted.
- Star values: `0` = unrated, `1-5` = rated.

---

## 3. API Routes

App Router route handlers under `src/app/api/`.

### 3.1 Authentication

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth` | Verify `APP_PASSWORD`, set HTTP-only auth cookie |
| `POST` | `/api/auth/name` | Set display-name cookie |
| `GET` | `/api/auth/users` | List users |
| `DELETE` | `/api/auth/users/[name]` | Remove a user |

### 3.2 Apartments

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` / `POST` | `/api/apartments` | List with avg ratings / create |
| `GET` / `PATCH` / `DELETE` | `/api/apartments/[id]` | Read / update / delete (cascades) |
| `POST` | `/api/apartments/[id]/ratings` | Upsert rating for current user |
| `POST` | `/api/apartments/[id]/reprocess` | Re-run AI extraction; preserves human-edited fields |
| `POST` | `/api/apartments/check-listings` | Probe listing URLs and mark expired ones |

### 3.3 PDF Parsing & Files

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/parse-pdf` | Direct upload (≤ 4.5 MB), store, run extraction |
| `GET` / `POST` | `/api/parse-pdf/upload-token` | Issue Vercel Blob client-upload tokens for large PDFs |
| `GET` | `/api/pdf/[...path]` | Authenticated PDF streaming |
| `GET` | `/api/uploads/[...path]` | Authenticated raw upload streaming |

### 3.4 Locations & Distance

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` / `POST` | `/api/locations` | List / create locations of interest |
| `GET` / `PUT` / `DELETE` | `/api/locations/[id]` | Read / update / delete a location |
| `POST` | `/api/locations/[id]/move` | Reorder by adjusting sort_order |
| `POST` | `/api/geocode/backfill` | Geocode apartments missing lat/lng |
| `POST` | `/api/settings/recompute-distances` | Recompute all per-location distances |

There is **no** `POST /api/distance` endpoint. Distance calculation is invoked indirectly via the recompute and backfill routes; the underlying logic lives in `src/lib/distance.ts` and `src/lib/geocode.ts`.

### 3.5 Costs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/costs` | API usage stats and estimated costs |

---

## 4. PDF Parsing Strategy

### 4.1 Approach

1. Accept a PDF file. Small PDFs come through `/api/parse-pdf` directly; large ones are uploaded by the browser straight to Vercel Blob using a token from `/api/parse-pdf/upload-token`, then the route is called with the resulting blob URL.
2. Store the PDF in Vercel Blob (cloud) or `./uploads/` (local).
3. Send the **PDF bytes** as a Vercel AI SDK `file` content block to Google Gemini (`gemini-2.5-flash`) with a structured-output Zod schema. (No PDF→image conversion; Gemini accepts PDFs natively.)
4. Apply post-processing (e.g. detect "shared laundry" phrases that should override `hasWashingMachine`).
5. Return structured data plus blob URL for the upload form to display.

### 4.2 Prompt Design

The schema and prompt (in `src/lib/parse-pdf.ts`) cover:

- Bilingual listings (German + English).
- Numeric extraction from phrases like "3.5 Zimmer" or "85 m²".
- ISO date normalization for `availableFrom` (e.g. `Bezugstermin: 01.05.2026` → `2026-05-01`); `null` for "ab sofort".
- A short `summary` field describing the apartment.
- An evidence snippet for the laundry field used to disambiguate shared vs. in-unit laundry.
- `null` for any field that cannot be determined.

### 4.3 Model Selection

Currently fixed to Google Gemini (`gemini-2.5-flash`) when `GOOGLE_GENERATIVE_AI_API_KEY` is set; otherwise extraction is skipped and the user enters data manually. The Vercel AI SDK abstraction makes swapping providers straightforward.

### 4.4 Re-extraction

`POST /api/apartments/[id]/reprocess` re-runs extraction on the stored PDF. Fields the user has edited (tracked in `userEditedFields`) are preserved; AI-only fields are refreshed.

---

## 5. Authentication Flow

### 5.1 Password Gate

```
User visits / -> proxy.ts checks auth cookie
  No cookie?    -> show password screen
  Password OK?  -> set HTTP-only auth cookie -> redirect to /add-user (or /apartments if a name is set)
  Name picked?  -> set display-name cookie -> redirect to /apartments
```

### 5.2 Session Management

- Auth state: HTTP-only cookie containing a signed token.
- Display name: separate cookie (readable by client).
- The proxy (`src/proxy.ts` — this is what was `middleware.ts` before Next.js 16 renamed it) gates all routes except `/`, `/add-user`, and the auth API.
- Route handlers gate access by calling `isAuthenticated()` (boolean) and read the current actor with `getDisplayName()`, both from `src/lib/auth.ts`. There's no shared `requireUser()` helper.
- Cookies are `Secure` in production unless `DISABLE_SECURE_COOKIES` is set.
- No expiry for MVP (session lasts until cookie cleared).

---

## 6. Component / File Architecture

```
src/
  app/
    layout.tsx, error.tsx, globals.css
    page.tsx                     # Password gate
    add-user/page.tsx
    apartments/
      page.tsx                   # List
      new/page.tsx               # Upload + parse
      [id]/page.tsx              # Detail + ratings
    compare/page.tsx
    costs/page.tsx
    guide/page.tsx
    settings/page.tsx            # Locations of interest, recompute
    api/
      auth/                      # password, name, users, users/[name]
      apartments/                # list, create, get, update, delete,
                                 # ratings, reprocess, check-listings
      parse-pdf/                 # POST + upload-token (client-direct Blob)
      pdf/[...path], uploads/[...path]   # Authenticated file streaming
      geocode/backfill
      locations/                 # list, create, get, update, delete, move
      settings/recompute-distances
      costs

  components/                    # shadcn/ui + custom (apartment cards,
                                 # comparison grid, star rating, map, etc.)
  content/guide.md               # User guide markdown source

  lib/
    db/                          # Drizzle schema, client, migrate
    auth.ts                      # Cookie/session helpers (isAuthenticated, getDisplayName, etc.)
    parse-pdf.ts                 # AI extraction (Gemini)
    parse-pdf-error.ts           # Classified error reasons
    distance.ts                  # Google Maps / ORS distance
    geocode.ts                   # Google / ORS geocoding
    locations.ts                 # Locations of interest helpers
    listing-status.ts            # Detect expired listings
    map-embed.ts                 # Google Maps Embed URL builder
    short-code.ts                # Short-code generator
    storage.ts                   # File storage (Blob / filesystem)
    upload-pdf.ts                # Client-direct Vercel Blob upload (>4.5 MB)
    apartment-sort.ts, edited-fields.ts, fetch-error.ts, iso-date.ts,
    location-icons.ts, unsaved-changes.ts, use-apartment-pager.ts,
    use-persisted-enum.ts, utils.ts

  proxy.ts                       # Auth gate (renamed middleware.ts in Next 16)
  instrumentation.ts             # Boot-time hook (DB migrations)
```

---

## 7. Deployment

### 7.1 Vercel

- Framework preset: Next.js (16).
- Build command: `next build` (a custom `vercel-build` script wraps it).
- Environment variables: see `.env.example` and the README.
- Vercel Blob: provision via Vercel dashboard.
- Database migrations run at boot via `src/instrumentation.ts`.

### 7.2 Turso

- Create database at turso.tech.
- Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel.
- `npx drizzle-kit push` applies the schema before first deploy.

### 7.3 Docker / self-hosted

- `Dockerfile` is a multi-stage build on `node:24-alpine`.
- `docker compose up -d` runs the app on port 3002 (configurable via `PORT`).
- Data persists in volumes `flatpare-data` (SQLite) and `flatpare-uploads` (PDFs).
- `docker-entrypoint.sh` runs migrations on start.
