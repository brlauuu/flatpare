# Apartment Tracker — Product Requirements Document

**Version:** v1.2  
**Date:** April 2026

---

## 1. Overview

Apartment Tracker is a collaborative web application that lets two users — Đorđe and Lara — independently rate, annotate, and compare rental apartment listings in Basel, Switzerland. The app is designed for active apartment hunting: listings are added manually or parsed from PDF exports of real estate portals, and each user maintains their own set of personal scores and notes per apartment.

### 1.1 Problem statement

When two people search for an apartment together, ratings and impressions are typically exchanged verbally or via scattered messages. There is no shared artefact that tracks both perspectives, preserves the original listing data, and allows side-by-side comparison. This app solves that.

### 1.2 Goals

- Allow both users to rate apartments independently across five subjective dimensions
- Persist all data across sessions without requiring user accounts or a backend
- Parse listing details from PDF exports of Homegate and Comparis listings
- Support adding new apartments at any time
- Display a unified comparison table showing both users' ratings side by side
- Require a shared app password on first visit before loading apartment data
- Provide clear setup and deployment instructions for Vercel and Fireworks AI usage

### 1.3 Non-goals

- Real-time collaboration or live sync between devices
- Automated scraping of real estate portals (blocked by 403)
- Full user authentication, account management, or role-based access control
- Mobile-native app — responsive web is sufficient
- Hidden or undocumented deployment/security setup steps

---

## 2. Users

There are exactly two named users: Đorđe and Lara. The app does not require personal user accounts. The active user is selected via a toggle in the top bar. Each user's data is stored separately. Future iterations may support additional users via a configurable user list.

### 2.1 Access gate (MVP)

Before a visitor can use the app, they must pass a shared password gate. This is a simple app-level access check (not full authentication):

- On first visit per device/browser, show a password screen
- If password is correct, store an unlocked flag locally and continue into app
- If password is wrong, stay on lock screen and show an error
- Add a "Lock app" action that clears the unlocked flag for the current browser

---

## 3. Features

### 3.1 Apartment list

The app maintains a list of apartments. Each apartment has the following fields:

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `name` | string | Derived | First two words of address if not set |
| `addr` | string | Manual / parsed | Full street address including postcode |
| `url` | string | Manual / parsed | Link to original listing |
| `rent` | number | Parsed | Total monthly rent in CHF |
| `rooms` | number | Parsed | Swiss room count (e.g. 3.5) |
| `baths` | number | Parsed | Bathroom count |
| `bal` | number / string | Parsed | Number of balconies or `"?"` |
| `dist` | string | Estimated | Estimated travel time to Basel SBB |
| `wash` | string | Parsed | `"yes"`, `"no"`, or `"?"` |
| `info` | string | Manual / parsed | Short descriptor line shown in the card |

### 3.2 Per-user data

Each user has the following data stored per apartment:

| Field | Type | Description |
|-------|------|-------------|
| `kitchen` | integer 0–5 | Star rating for kitchen quality |
| `balcony` | integer 0–5 | Star rating for balcony quality |
| `floorplan` | integer 0–5 | Star rating for floor plan layout |
| `light` | integer 0–5 | Star rating for amount of natural light |
| `feel` | integer 0–5 | Overall feeling / vibe rating |
| `note` | string | Free-text notes and impressions |

### 3.3 Entry view

The entry view shows one apartment at a time. Navigation between apartments is done via prev/next buttons. The active user is shown via a badge next to the score and notes sections. All listing fields are shown read-only; only scores and notes are editable. An "Open listing" button links directly to the original URL.

### 3.4 Compare view

The compare view renders a horizontally scrollable table with one row per apartment. Columns are: address, listing link, rent (lowest highlighted), rooms, distance to Basel SBB, washing machine, and then five score columns per user (kitchen, balcony, floor plan, light, feel) and a notes column per user. User scores are visually distinguished by colour — purple dots for Đorđe, pink for Lara.

### 3.5 Add apartment

A form allows adding a new apartment manually. Required field: address. All other fields are optional. On submit, the new apartment is appended to the list and both users get an empty score record for it. The app navigates to the new apartment in the entry view after saving.

### 3.6 PDF parsing

When a user uploads a PDF export from Homegate or Comparis, the app extracts structured listing fields and pre-populates the apartment record. Fields that are missing from the PDF are left as `"?"`. The distance to Basel SBB is estimated based on neighbourhood knowledge of Basel's transit network and is flagged as an estimate.

### 3.7 PDF parsing via Fireworks AI API (MVP)

Parsing is implemented in the app as an explicit feature (not manual assistant-only flow):

- User uploads PDF in the app (drag/drop or file picker)
- Frontend sends the PDF to a Vercel serverless route
- The serverless route calls Fireworks AI API with a document-capable model
- Model returns structured JSON for apartment fields (`addr`, `rent`, `rooms`, `baths`, `bal`, `wash`, `url`, `info`)
- Server validates/normalizes values and returns final parsed payload
- User reviews parsed values before saving apartment

Fireworks model choice should be configurable via environment variable so model can be swapped without code changes.

API key source and storage requirements:

- Fireworks API key is created in the Fireworks AI account dashboard (`fireworks.ai` -> API Keys)
- Production key must be stored only in Vercel Project Environment Variables as `FIREWORKS_API_KEY`
- Local development key is stored in `.env.local` and must never be committed

---

## 4. Data storage

### 4.1 Current implementation (Claude.ai widget)

The widget version uses the Claude.ai persistent storage API (`window.storage`), a key-value store scoped to the artifact. Keys used:

- `apts-v1` — JSON array of apartment objects
- `scores-djordje-v1` — JSON array of per-apartment score objects for Đorđe
- `scores-lara-v1` — JSON array of per-apartment score objects for Lara

On first load, if `scores-djordje-v1` is empty, the app checks `localStorage` for `apt-scores-v4` (the previous single-user version) and migrates the data automatically.

### 4.2 Standalone app implementation

Replace `window.storage` with `localStorage`. Use the same key names. The migration logic from `apt-scores-v4` should be preserved. Storage calls are async in the widget; in `localStorage` they are synchronous — simplify accordingly.

Additional local keys for MVP access gate:

- `app-unlocked-v1` — `"true"` when password gate was passed on this browser

### 4.3 Future: backend storage

For true cross-device sync, replace `localStorage` with a lightweight backend. Suggested options: Supabase (free tier, Postgres, REST API), PocketBase (self-hosted), or a simple JSON file on a VPS. The storage interface should be abstracted behind a thin adapter so the swap is localised.

---

## 5. Technical architecture

### 5.1 Recommended stack

- **Framework:** React 18 with Vite
- **Styling:** CSS Modules or Tailwind CSS
- **State:** `useState` + `useReducer` — no external state library needed at this scale
- **Storage:** `localStorage` adapter (swappable for Supabase/PocketBase later)
- **Deployment:** Vercel (primary target)
- **Build:** `npm run build` for frontend bundle
- **Server routes:** Vercel Functions for password verification and Fireworks PDF parsing
- **Env vars:** `APP_PASSWORD`, `FIREWORKS_API_KEY`, `FIREWORKS_MODEL`

### 5.2 Component structure

- `App` — root, loads data, manages `activeUser` and `currentApt` index
- `AccessGate` — password screen shown before app content
- `TopBar` — tab navigation + user toggle
- `EntryView` — single apartment card + score editor + notes
- `ApartmentCard` — read-only listing details
- `ScoreEditor` — five star-rating fields, user-aware colouring
- `CompareView` — scrollable table, both users side by side
- `AddForm` — form for manually adding a new apartment
- `PdfImport` — upload UI + review parsed apartment fields
- `storage.js` — localStorage adapter (swap this for backend later)
- `api/verify-password` — validates password server-side
- `api/parse-pdf` — Fireworks parsing proxy + normalization

### 5.3 Deployment

Recommended Vercel deployment flow:

1. Push code to a GitHub repository
2. Import repository into Vercel
3. Set build command: `npm run build`
4. Configure environment variables: `APP_PASSWORD`, `FIREWORKS_API_KEY`, `FIREWORKS_MODEL`
5. Ensure serverless routes are deployed with the frontend
6. Every push to `main` deploys automatically

### 5.4 Developer setup and operations documentation

The repository must include a complete operator/developer guide in `README.md` (and linked docs pages when needed) covering:

1. Vercel setup:
   - Create/import project on Vercel
   - Where to set Environment Variables (Project Settings -> Environment Variables)
   - Which environments require each variable (Production/Preview/Development)
2. Fireworks setup:
   - Where to create API keys in Fireworks dashboard
   - Required model id format for `FIREWORKS_MODEL`
   - How to rotate/revoke keys
3. Local development:
   - Required `.env.local` values
   - `.env.example` template that lists required variables without secrets
4. Troubleshooting:
   - Common errors for missing/invalid env vars
   - PDF parse failure fallback to manual apartment entry

### 5.5 Quality gates, CI, and project metadata

The MVP delivery must include:

- Automated test suite with all tests passing in CI before merge
- `README.md` and docs kept up to date with any behavior/setup changes
- GitHub Actions workflow(s) for at least: install, lint, test, and build
- README badges for: CI status, test status, and key tool/runtime versions used in the project
- Contributor credit in README including AI-assisted contribution acknowledgment for Codex
- License file and README license section using O'SAASY license text and attribution placeholders completed for this project

---

## 6. Known limitations and future work

- **No real-time sync** — if both users open the app simultaneously on different devices, writes will overwrite each other. Acceptable for this use case; fix with a backend if needed.
- **Simple password gate only** — this is shared-password protection and not full auth; it is sufficient for MVP but not for strong security requirements.
- **LLM extraction variance** — PDF parsing quality depends on PDF quality and chosen Fireworks model; user review before save remains required.
- **Fixed user list** — users are hardcoded as Đorđe and Lara. To support configurable users, move the user list to a settings object in storage and render the toggle dynamically.
- **No sorting or filtering** — the compare table is not sortable. Add sort-by-column and filter-by-score as a next iteration.
- **Distance estimates** — transit distances to Basel SBB were hand-estimated. Integrate the SBB open data API or Google Maps Distance Matrix for accurate times.
