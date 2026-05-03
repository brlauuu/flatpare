# Flatpare - Product Requirements Document

**Version:** v3.0
**Date:** May 2026

---

## 1. Overview

Flatpare is a collaborative apartment comparison tool for a small group (2-3 people) searching for rental apartments in the Basel, Switzerland area. Users upload PDF printouts from apartment listing websites, the app extracts structured data using AI, and all participants can independently rate and compare apartments in a unified comparison grid.

### 1.1 Problem Statement

When multiple people search for an apartment together, tracking and comparing listings is scattered across messaging apps, spreadsheets, and verbal discussions. There is no shared tool that preserves listing data, captures each person's subjective ratings, and enables structured side-by-side comparison.

### 1.2 Goals

- Upload apartment listing PDFs and auto-extract structured data (size, rent, rooms, address, etc.)
- Auto-calculate travel distance (bike + transit) from each apartment to user-managed locations of interest (work, schools, family)
- Allow each user to independently rate apartments across five subjective categories
- Provide a full comparison grid showing all apartments with metrics and ratings
- Detect when a listing is removed from the source site so stale listings can be hidden
- Modern, minimal design optimized for mobile and desktop
- Simple shared-password access gate (no per-user account overhead)
- Deploy on Vercel with minimal operational complexity, with a self-hosted Docker fallback

### 1.3 Non-Goals

- Real-time collaboration / live sync (acceptable for 2-3 users)
- Full authentication system with per-user passwords or RBAC
- Automated scraping of listing websites
- Native mobile app (responsive web is sufficient)

---

## 2. Users

The app supports 2-3 simultaneous users identified by display name. There are no per-user accounts. After passing the shared password gate, each person picks a display name from the user list (or creates one on first run). Display name is stored in a cookie and ratings are attributed to it.

### 2.1 Access Gate

- Single shared password for all users (set via `APP_PASSWORD` env var)
- On first visit, show password input screen
- On success, prompt for display name (existing user list, or add a new one)
- Auth state stored in HTTP-only cookie; display name in a separate readable cookie
- No "remember me" / no password reset / no RBAC

---

## 3. Core Features

### 3.1 Apartment Data Model

Each apartment record contains:

| Field | Type | Source |
|-------|------|--------|
| `name` | string | Extracted from listing title |
| `address` | string | Extracted from PDF |
| `sizeM2` | number | Extracted (square meters) |
| `numRooms` | number | Extracted (Swiss room count, e.g. 3.5) |
| `numBathrooms` | number | Extracted |
| `numBalconies` | number | Extracted |
| `hasWashingMachine` | boolean | Extracted; in-unit only, not shared laundry |
| `rentChf` | number | Extracted (monthly rent in CHF) |
| `availableFrom` | string (ISO date) | Extracted; null for "ab sofort" |
| `summary` | string | AI-written one-liner describing the apartment |
| `pdfUrl` | string | Vercel Blob URL (or local path) of uploaded PDF |
| `listingUrl` | string | Source listing URL, if visible in the PDF |
| `shortCode` | string | Short, unique, human-friendly ID for the apartment |
| `latitude` / `longitude` | number | Geocoded from address (Google or ORS) |
| `listingGone` / `listingCheckedAt` | bool / timestamp | Set by the listing-status checker |
| `userEditedFields` | JSON | Tracks which fields a human edited (so re-extraction won't overwrite them) |
| `rawExtractedData` | JSON | Full AI extraction for reference |

Per-location distances live in a separate `apartment_distances` table keyed on `(apartmentId, locationId)`, not on the apartment row itself.

### 3.2 Rating System

Each user rates each apartment on five categories (1-5 stars):

| Category | Description |
|----------|-------------|
| Kitchen | Quality/size of kitchen |
| Balconies | Quality/size of balcony/terrace |
| Location | Overall location quality |
| Floorplan | Layout and flow of rooms |
| Overall feeling | General vibe and impression |

Plus a free-text comment field per apartment per user.

### 3.3 PDF Upload & Parsing

1. User uploads a PDF via drag-and-drop or file picker.
2. Small PDFs (≤ 4.5 MB) are POSTed straight to `/api/parse-pdf`. Larger PDFs use the client-direct Vercel Blob upload path (`/api/parse-pdf/upload-token`) to bypass the serverless body limit.
3. The PDF bytes are sent to Google Gemini (`gemini-2.5-flash`) via the Vercel AI SDK as a `file` content block, with a structured-output Zod schema.
4. Extracted data is shown in an editable form for user review/correction.
5. User confirms and saves the apartment record. Edited fields are tracked so a later "Reprocess" doesn't clobber human corrections.

### 3.4 Distance Calculation

- Reference points are user-managed **locations of interest** (label, icon, address, sort order, geocoded lat/lng).
- For each (apartment, location) pair, bike and transit minutes are computed via Google Maps Distance Matrix (preferred) or OpenRouteService (free fallback, bike only).
- Distances are recomputed on demand from the settings page; manual overrides are not currently supported.

### 3.5 Comparison View

- Shows all apartments by default in a horizontally scrollable grid.
- Columns = apartments, rows = metrics, distances, and ratings.
- Each column has a "Hide" button (visual only; doesn't delete from DB).
- Hidden state resets on page refresh.
- Visual highlights for best/worst values per row.

### 3.6 Listing Status Checks

A periodic-or-on-demand check pings each listing URL and marks the apartment as "listing gone" when the URL is removed (HTTP error or expired-listing pattern). The detail view shows a stale-listing badge so users can choose to hide or delete it.

---

## 4. Pages & Navigation

### 4.1 Password Gate (`/`)
- Centered card with password input.
- On success, redirects to user picker / add-user flow.

### 4.2 Add User (`/add-user`)
- First-run user onboarding: pick from existing display names or create a new one.

### 4.3 Apartment List (`/apartments`)
- Grid or list of apartment cards: name, address, size, rent, average rating, listing-gone badge.
- "Upload New" button.
- Sortable by rent, size, average rating, distance to a chosen location, date added.

### 4.4 Upload & Parse (`/apartments/new`)
- Drag-and-drop PDF upload (auto-routes between direct POST and client-direct Blob upload by file size).
- Progress indicator: uploading → parsing → geocoding → distances.
- Editable form showing extracted data with retry support.

### 4.5 Apartment Detail (`/apartments/[id]`)
- Full extracted data, embedded map, link to view/download PDF.
- All users' ratings with per-category averages.
- Current user's rating form (stars + comment).
- Edit, reprocess, and delete actions.

### 4.6 Comparison (`/compare`)
- Full-width horizontally scrollable grid.
- All apartments shown by default; per-column hide toggle.
- Best/worst highlighting per row.

### 4.7 Settings (`/settings`)
- Manage locations of interest (CRUD + reorder).
- Trigger distance recompute and geocode backfill.

### 4.8 Costs (`/costs`)
- API usage stats per service/operation with estimated cost.

### 4.9 Guide (`/guide`)
- In-app user guide (markdown source in `src/content/guide.md`).

---

## 5. Technical Architecture

### 5.1 Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | SQLite via Turso (cloud) or local file (self-hosted) |
| ORM | Drizzle ORM (libSQL client) |
| Styling | Tailwind CSS 4 + shadcn/ui |
| File Storage | Vercel Blob (cloud) or local filesystem |
| PDF Parsing | Vercel AI SDK + Google Gemini (`gemini-2.5-flash`) |
| Distance API | Google Maps Distance Matrix; OpenRouteService fallback |
| Geocoding | Google Geocoding; OpenRouteService fallback |
| Map embed | Google Maps Embed (or Leaflet for the overview map) |
| Deployment | Vercel (primary), Docker (self-hosted) |

### 5.2 Environment Variables

See `.env.example` and the README's Environment Variables section. Notable additions since v2.0: `LOCAL_DB_URL` (local SQLite path override) and `DISABLE_SECURE_COOKIES` (HTTP-dev convenience).

### 5.3 Database

Six tables: `apartments`, `ratings`, `users`, `api_usage`, `locations_of_interest`, `apartment_distances`. Schema details and routes live in the Technical Specification.

---

## 6. Design Principles

- **Minimal**: clean, uncluttered UI with generous whitespace.
- **Mobile-first**: all views usable on phone screens; comparison view uses horizontal scroll.
- **Fast**: optimistic UI, loading skeletons, no unnecessary page reloads.
- **Forgiving**: AI extraction errors are easily correctable; reprocess preserves human edits.

---

## 7. Future Work

- Sortable / filterable comparison columns.
- Photo gallery from PDF images.
- SBB open-data API for more accurate transit times.
- Export comparison as PDF/spreadsheet.
- Manual override for individual per-location distances.
