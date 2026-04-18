# Flatpare - Product Requirements Document

**Version:** v2.0
**Date:** April 2026

---

## 1. Overview

Flatpare is a collaborative apartment comparison tool for a small group (2-3 people) searching for rental apartments in the Basel, Switzerland area. Users upload PDF printouts from apartment listing websites, the app extracts structured data using AI, and all participants can independently rate and compare apartments in a unified comparison grid.

### 1.1 Problem Statement

When multiple people search for an apartment together, tracking and comparing listings is scattered across messaging apps, spreadsheets, and verbal discussions. There is no shared tool that preserves listing data, captures each person's subjective ratings, and enables structured side-by-side comparison.

### 1.2 Goals

- Upload apartment listing PDFs and auto-extract structured data (size, rent, rooms, address, etc.)
- Auto-calculate travel distance to Basel SBB by bike and public transit
- Allow each user to independently rate apartments across five subjective categories
- Provide a full comparison grid showing all apartments with metrics and ratings
- Modern, minimal design optimized for mobile and desktop
- Simple shared-password access gate (no user account overhead)
- Deploy on Vercel with minimal operational complexity

### 1.3 Non-Goals

- Real-time collaboration / live sync (acceptable for 2-3 users)
- Full authentication system with user accounts
- Automated scraping of listing websites
- Native mobile app (responsive web is sufficient)
- Docker / self-hosted deployment (Vercel only)

---

## 2. Users

The app supports 2-3 simultaneous users identified by display name. There are no user accounts. After passing the shared password gate, each person enters a display name which is stored in a cookie. Ratings are attributed to the display name.

### 2.1 Access Gate

- Single shared password for all users (set via `APP_PASSWORD` env var)
- On first visit, show password input screen
- On success, prompt for display name, store auth state in HTTP-only cookie
- No "remember me" / no password reset / no RBAC

---

## 3. Core Features

### 3.1 Apartment Data Model

Each apartment record contains:

| Field | Type | Source |
|-------|------|--------|
| `name` | string | Extracted from listing title |
| `address` | string | Extracted from PDF |
| `size_m2` | number | Extracted (square meters) |
| `num_rooms` | number | Extracted (Swiss room count, e.g. 3.5) |
| `num_bathrooms` | number | Extracted |
| `num_balconies` | number | Extracted |
| `rent_chf` | number | Extracted (monthly rent in CHF) |
| `distance_bike_min` | number | Auto-calculated or manual |
| `distance_transit_min` | number | Auto-calculated or manual |
| `pdf_url` | string | Vercel Blob URL of uploaded PDF |
| `raw_extracted_data` | JSON | Full AI extraction for reference |

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

1. User uploads a PDF via drag-and-drop or file picker
2. PDF is stored in Vercel Blob
3. PDF pages are sent to a vision-capable AI model via Vercel AI SDK
4. AI extracts structured apartment data (handles German and English listings)
5. Extracted data is shown in an editable form for user review/correction
6. User confirms and saves the apartment record

### 3.4 Distance Calculation

- Reference point: Basel SBB (hardcoded, coordinates: 47.5476, 7.5897)
- Auto-calculate bike and public transit travel time via Google Maps Distance Matrix API
- If API fails or address is unclear, fall back to manual input
- Users can always manually override calculated distances

### 3.5 Comparison View

- Shows ALL apartments by default in a horizontally scrollable grid
- Columns = apartments, rows = metrics and ratings
- Each column has a "Hide" button to temporarily remove it from view (does not delete from DB)
- Hidden state resets on page refresh (stored in component state only)
- Visual indicators (color coding) for best/worst values in each metric row
- Rows include: all extracted metrics + each user's ratings + average ratings

---

## 4. Pages & Navigation

### 4.1 Password Gate (`/`)
- Centered card with password input
- On success, prompt for display name
- Redirect to apartment list

### 4.2 Apartment List (`/apartments`)
- Grid of apartment cards: name, address, size, rent, average rating
- "Upload New" button
- Sort by: rent, size, average rating, date added
- Filter by: min/max rooms, min/max size

### 4.3 Upload & Parse (`/apartments/new`)
- Drag-and-drop PDF upload area
- Progress indicator: uploading -> parsing -> extracting distances
- Editable form showing extracted data
- Save button creates apartment record

### 4.4 Apartment Detail (`/apartments/[id]`)
- Full extracted data display
- Link to view/download PDF
- All users' ratings with per-category averages
- Current user's rating form (star selector + comment)
- Edit button for extracted data corrections

### 4.5 Comparison (`/compare`)
- Full-width horizontally scrollable grid
- All apartments shown by default
- Hide/show individual apartments
- Best/worst highlighting per row

---

## 5. Technical Architecture

### 5.1 Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | SQLite via Turso |
| ORM | Drizzle ORM |
| Styling | Tailwind CSS + shadcn/ui |
| File Storage | Vercel Blob |
| PDF Parsing | Vercel AI SDK (vision model) |
| Distance API | Google Maps Distance Matrix |
| Deployment | Vercel |

### 5.2 Environment Variables

| Variable | Purpose |
|----------|---------|
| `APP_PASSWORD` | Shared access password |
| `TURSO_DATABASE_URL` | Turso database connection URL |
| `TURSO_AUTH_TOKEN` | Turso authentication token |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token |
| `GOOGLE_MAPS_API_KEY` | Google Maps Distance Matrix API |
| AI provider key (e.g. `GOOGLE_GENERATIVE_AI_API_KEY` or `OPENAI_API_KEY`) | For PDF parsing |

### 5.3 Database

SQLite via Turso with Drizzle ORM. Two tables: `apartments` and `ratings`. See Technical Specification for schema details.

---

## 6. Design Principles

- **Minimal**: Clean, uncluttered UI with generous whitespace
- **Mobile-first**: All views usable on phone screens; comparison view uses horizontal scroll
- **Fast**: Optimistic UI updates, loading skeletons, no unnecessary page reloads
- **Forgiving**: AI extraction errors are easily correctable via editable forms

---

## 7. Future Work

- Sortable/filterable comparison columns
- Photo gallery from PDF images
- SBB open data API for more accurate transit times
- Export comparison as PDF/spreadsheet
- Configurable reference points (not just Basel SBB)
