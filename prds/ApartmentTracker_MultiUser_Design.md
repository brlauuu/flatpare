# Flatpare - Technical Specification

**Version:** v2.0
**Date:** April 2026

---

## 1. Purpose

This document describes the technical implementation details for Flatpare: database schema, API routes, PDF parsing strategy, authentication flow, and component architecture.

---

## 2. Database Schema (Drizzle ORM + Turso/SQLite)

### 2.1 Apartments Table

```typescript
export const apartments = sqliteTable('apartments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address'),
  sizeM2: real('size_m2'),
  numRooms: real('num_rooms'),
  numBathrooms: integer('num_bathrooms'),
  numBalconies: integer('num_balconies'),
  rentChf: real('rent_chf'),
  distanceBikeMin: integer('distance_bike_min'),
  distanceTransitMin: integer('distance_transit_min'),
  pdfUrl: text('pdf_url'),
  rawExtractedData: text('raw_extracted_data', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).defaultNow(),
});
```

### 2.2 Ratings Table

```typescript
export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  apartmentId: integer('apartment_id').notNull().references(() => apartments.id, { onDelete: 'cascade' }),
  userName: text('user_name').notNull(),
  kitchen: integer('kitchen').default(0),
  balconies: integer('balconies').default(0),
  location: integer('location').default(0),
  floorplan: integer('floorplan').default(0),
  overallFeeling: integer('overall_feeling').default(0),
  comment: text('comment').default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).defaultNow(),
});
```

### 2.3 Constraints

- One rating per (apartment_id, user_name) pair — enforced via unique index
- Ratings cascade-delete when an apartment is deleted
- Star values: 0 = unrated, 1-5 = rated

---

## 3. API Routes

### 3.1 Authentication

**`POST /api/auth`**
- Body: `{ password: string }`
- Validates against `APP_PASSWORD` env var
- On success: sets HTTP-only cookie with session token, returns `{ success: true }`
- On failure: returns 401

**`POST /api/auth/name`**
- Body: `{ displayName: string }`
- Sets display name in cookie
- Returns `{ success: true }`

### 3.2 Apartments

**`GET /api/apartments`**
- Returns all apartments with aggregated average ratings

**`POST /api/apartments`**
- Body: apartment fields (from parsed PDF or manual entry)
- Creates apartment record
- Returns created apartment

**`GET /api/apartments/[id]`**
- Returns single apartment with all ratings

**`PATCH /api/apartments/[id]`**
- Updates apartment fields (for manual corrections)

**`DELETE /api/apartments/[id]`**
- Deletes apartment and cascading ratings

### 3.3 Ratings

**`POST /api/apartments/[id]/ratings`**
- Body: `{ kitchen, balconies, location, floorplan, overallFeeling, comment }`
- Creates or updates rating for current user on this apartment (upsert)

### 3.4 PDF Parsing

**`POST /api/parse-pdf`**
- Receives PDF file upload
- Uploads to Vercel Blob
- Converts PDF pages to images
- Sends to vision model via Vercel AI SDK with structured output schema
- Returns extracted apartment data + blob URL

### 3.5 Distance

**`POST /api/distance`**
- Body: `{ address: string }`
- Calls Google Maps Distance Matrix API for bike + transit from Basel SBB
- Returns `{ bikeMinutes: number, transitMinutes: number }`

---

## 4. PDF Parsing Strategy

### 4.1 Approach

1. Accept PDF upload via multipart form data
2. Store PDF in Vercel Blob
3. Convert PDF pages to images (using pdf.js or similar)
4. Send images to a vision-capable model via Vercel AI SDK
5. Use structured output (JSON schema) to extract:
   - Listing title / name
   - Address
   - Size in m2
   - Number of rooms
   - Number of bathrooms
   - Number of balconies
   - Monthly rent (CHF)
   - Any mentioned travel distances
6. Return structured data for user review

### 4.2 Prompt Design

The extraction prompt must:
- Handle both German and English listing text
- Extract numeric values from text like "3.5 Zimmer" or "85 m2"
- Return `null` for fields that cannot be determined
- Handle multiple PDF pages (listing details may span pages)

### 4.3 Model Selection

Use Vercel AI SDK which allows easy provider switching. Recommended initial providers:
- Google Gemini (good multilingual + vision support)
- OpenAI GPT-4o (strong structured output)

The provider is configured via environment variable, making it easy to switch.

---

## 5. Authentication Flow

### 5.1 Password Gate

```
User visits / -> Check cookie -> No auth cookie?
  -> Show password screen
  -> User enters password
  -> POST /api/auth
  -> Success? Set HTTP-only cookie + redirect to name prompt
  -> Name entered? Set name cookie + redirect to /apartments
```

### 5.2 Session Management

- Auth state: HTTP-only cookie containing a signed token
- Display name: separate cookie (readable by client)
- Middleware checks auth cookie on all routes except `/` and `/api/auth`
- No expiry for MVP (session lasts until cookie cleared)

---

## 6. Component Architecture

```
app/
  layout.tsx          — Root layout, font loading, theme
  page.tsx            — Password gate (login page)
  middleware.ts       — Auth check on protected routes
  
  apartments/
    page.tsx          — Apartment list grid
    new/
      page.tsx        — PDF upload + parse + review form
    [id]/
      page.tsx        — Apartment detail + ratings
  
  compare/
    page.tsx          — Full comparison grid

  api/
    auth/
      route.ts        — Password verification
      name/
        route.ts      — Set display name
    apartments/
      route.ts        — GET all, POST new
      [id]/
        route.ts      — GET one, PATCH, DELETE
        ratings/
          route.ts    — POST (upsert rating)
    parse-pdf/
      route.ts        — PDF upload + AI parsing
    distance/
      route.ts        — Google Maps distance lookup

components/
  password-gate.tsx
  apartment-card.tsx
  star-rating.tsx
  pdf-upload.tsx
  comparison-grid.tsx
  nav-bar.tsx

lib/
  db.ts              — Drizzle + Turso client
  schema.ts          — Drizzle schema definitions
  auth.ts            — Cookie/session helpers
  parse-pdf.ts       — AI parsing logic
  distance.ts        — Google Maps API wrapper
```

---

## 7. Deployment

### 7.1 Vercel Configuration

- Framework preset: Next.js
- Build command: `next build`
- Environment variables: see PRD section 5.2
- Vercel Blob: provision via Vercel dashboard

### 7.2 Turso Database

- Create database at turso.tech
- Get connection URL and auth token
- Set as environment variables in Vercel
- Run migrations via `drizzle-kit push` before first deploy
