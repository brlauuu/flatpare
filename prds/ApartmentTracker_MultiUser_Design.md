# Multi-User System Design
## Apartment Tracker — Technical Specification

**Version:** v1.2  
**Date:** April 2026

---

## 1. Purpose

This document describes the multi-user data model, storage design, and UI patterns for the Apartment Tracker app. It focuses specifically on how two users can independently rate and annotate the same set of apartments, and how those ratings are stored, migrated, and displayed. It also defines MVP access protection and PDF parsing via Fireworks AI API on Vercel.

---

## 2. Data model

### 2.1 Separation of concerns

The data is split into two distinct concerns:

- **Apartment data** — Shared. One record per apartment, containing all listing fields (address, rent, rooms, etc.). Neither user "owns" this data.
- **Score data** — Per-user. Each user has their own array of score records, one per apartment, indexed by position. Score arrays are stored and loaded independently.

### 2.2 Storage keys

| Key | Owner | Shape | Notes |
|-----|-------|-------|-------|
| `apts-v1` | Shared | `Apartment[]` | Append-only in practice |
| `scores-djordje-v1` | Đorđe | `ScoreRecord[]` | Index matches `apts-v1` |
| `scores-lara-v1` | Lara | `ScoreRecord[]` | Index matches `apts-v1` |
| `app-unlocked-v1` | Shared (browser-local) | `"true"` or missing | Password gate state for current browser |

### 2.3 Type definitions

```typescript
type Apartment = {
  name:  string
  addr:  string
  url:   string
  rent:  number | string
  rooms: number | string
  baths: number | string
  bal:   number | string
  dist:  string
  wash:  "yes" | "no" | "?"
  info:  string
}

type ScoreRecord = {
  kitchen:   0 | 1 | 2 | 3 | 4 | 5
  balcony:   0 | 1 | 2 | 3 | 4 | 5
  floorplan: 0 | 1 | 2 | 3 | 4 | 5
  light:     0 | 1 | 2 | 3 | 4 | 5
  feel:      0 | 1 | 2 | 3 | 4 | 5
  note: string
}
```

### 2.4 Index invariant

The score arrays are positionally aligned with the apartment array: `scores[user][i]` corresponds to `apts[i]`. This means:

- When a new apartment is appended, an empty `ScoreRecord` must be pushed to every user's score array in the same operation.
- Apartments must never be removed or reordered without also updating all score arrays.
- If a score array is shorter than the apartment array (e.g. after a partial save), missing entries are treated as `emptyScoreRecord()` on read.

---

## 3. Storage adapter

### 3.1 Interface

All storage operations should go through a single adapter module. This makes it trivial to swap the backend later.

```js
// storage.js
export const storage = {
  get: async (key) => JSON.parse(localStorage.getItem(key)),
  set: async (key, value) => localStorage.setItem(key, JSON.stringify(value)),
}

// Usage
const apts = await storage.get("apts-v1") ?? DEFAULT_APTS
await storage.set("apts-v1", apts)
```

### 3.2 Migration from v4 (single-user)

The previous version of the app stored Đorđe's scores in `localStorage` under the key `apt-scores-v4`, as an array of objects with a `usernote` field (instead of `note`) and no Lara data. The migration logic runs once on first load:

```js
const existing = await storage.get("scores-djordje-v1")
if (!existing || existing.length === 0) {
  const legacy = JSON.parse(localStorage.getItem("apt-scores-v4") ?? "[]")
  if (legacy.length > 0) {
    const migrated = legacy.map(p => ({
      kitchen:   p.kitchen   ?? 0,
      balcony:   p.balcony   ?? 0,
      floorplan: p.floorplan ?? 0,
      light:     p.light     ?? 0,
      feel:      p.feel      ?? 0,
      note:      p.usernote  ?? "",
    }))
    await storage.set("scores-djordje-v1", migrated)
  }
}
```

### 3.3 Access gate state

MVP access protection uses a simple shared password and a browser-local unlock flag:

- On app startup, read `app-unlocked-v1`
- If flag is missing, render lock screen and require password
- On successful verification, set `app-unlocked-v1 = "true"`
- On lock/logout action, remove `app-unlocked-v1`

Password value itself must never be stored in `localStorage`.

---

## 4. Access protection

### 4.1 Scope

This is a lightweight privacy gate for MVP, not a full authentication system:

- One shared password for all users
- No user accounts, no password reset flow, no RBAC
- Prevents casual access to the app URL

### 4.2 Verification flow

1. User enters password in `AccessGate`
2. Frontend sends password to `POST /api/verify-password`
3. Server compares input against `APP_PASSWORD` env var
4. On success, frontend stores `app-unlocked-v1` and loads app UI
5. On failure, frontend shows error and remains locked

`/api/verify-password` must return only success/failure metadata and never leak the configured password.

---

## 5. UI — user switching and gated entry

### 5.1 Toggle behaviour

The active user is held in React state (not in storage). It defaults to Đorđe on load. Switching users re-renders the entry view with the new user's scores and notes. No save is triggered on switch — in-progress edits are committed on each keystroke/click, not on blur.

### 5.2 Access gate screen

Before showing tabs/content, render a simple password screen with:

- Password input
- Unlock button
- Inline error text for invalid password

No apartment data should be displayed while locked.

### 5.3 Visual identity

| Element | Đorđe | Lara |
|---------|-------|------|
| Toggle button (active) | Purple — `#EEEDFE` bg, `#534AB7` border, `#3C3489` text | Pink — `#FBEAF0` bg, `#993556` border, `#72243E` text |
| Score badge | Purple pill | Pink pill |
| Star colour (filled) | `#534AB7` | `#D4537E` |
| Compare table dot colour | `#534AB7` | `#D4537E` |
| Compare table column header | Purple text | Pink text |

### 5.4 Compare table column layout

The compare table header row has two groups of score columns, clearly labelled:

1. **Columns 1–6** — shared data: apartment name, listing link, rent, rooms, SBB distance, washer
2. **Columns 7–12** — Đorđe's scores: kitchen, balcony, floor plan, light, feel, notes — headers in purple
3. **Columns 13–18** — Lara's scores: same five + notes — headers in pink

The table is horizontally scrollable. On narrower viewports, the first two columns (name + link) should be sticky.

---

## 6. PDF parsing via Fireworks

### 6.1 API architecture

PDF parsing is handled server-side on Vercel Functions:

- Frontend uploads PDF to `POST /api/parse-pdf`
- Route validates file type/size and forwards content to Fireworks AI API
- Fireworks model is selected by `FIREWORKS_MODEL` env var
- Route requests strict JSON output matching apartment schema
- Route normalizes uncertain/missing values to `"?"`
- Frontend shows parsed result for user confirmation before save

Environment variables:

- `FIREWORKS_API_KEY` — Fireworks API credential
- `FIREWORKS_MODEL` — model id used for document extraction

Secrets and key management:

- Fireworks API keys are created in the Fireworks dashboard (`fireworks.ai` -> API Keys)
- Use Vercel Project Environment Variables for deployed environments
- Use `.env.local` for local development only
- Commit a `.env.example` file listing required keys without secret values

### 6.2 Error handling

- If parsing fails, keep user in manual Add flow with prefilled fields where available
- Show clear parser error and allow retry
- Never block manual apartment creation if parser is unavailable

---

## 7. Adding apartments

### 7.1 Flow

When the user submits the Add Apartment form:

1. Validate that `addr` is non-empty
2. Append the new `Apartment` object to the `apts` array
3. Append `emptyScoreRecord()` to `scores.djordje` and `scores.lara`
4. Persist all three arrays in parallel (`Promise.all`)
5. Navigate to the new apartment in the entry view
6. Show a brief "Saved" confirmation

### 7.2 emptyScoreRecord

```js
const emptyScoreRecord = () => ({
  kitchen: 0, balcony: 0, floorplan: 0,
  light: 0, feel: 0, note: ""
})
```

---

## 8. Extending to more users

The current implementation hardcodes two users. To make the user list configurable:

- Store the user list in storage under a `users-v1` key: `[{ id, displayName, colorClass }]`
- Replace the hardcoded `USERS` constant with a loaded array
- Derive score storage keys dynamically: `` `scores-${user.id}-v1` ``
- Render the user toggle from the loaded list
- Add a settings screen to add/rename/remove users

Score arrays for new users are initialised with `apts.length` empty records on first load.

---

## 9. Deployment (Vercel)

1. Import GitHub repo into Vercel
2. Set build command: `npm run build`
3. Configure env vars: `APP_PASSWORD`, `FIREWORKS_API_KEY`, `FIREWORKS_MODEL`
4. Deploy frontend + Vercel Functions together
5. Verify lock screen appears on first visit and PDF parsing route works in Preview deployment

### 9.1 Required deployment docs

Repository docs must include:

- Step-by-step Vercel deployment instructions
- Where to set Vercel environment variables
- How to generate Fireworks API key and configure `FIREWORKS_MODEL`
- Local setup instructions for `.env.local`
- Failure modes for missing/invalid keys

---

## 10. CI/CD, testing, and documentation standards

### 10.1 GitHub Actions

Configure GitHub Actions workflows to run on pull requests and pushes to `main`:

1. Install dependencies
2. Lint
3. Unit/integration tests
4. Production build

Merges are expected only when checks are green.

### 10.2 README and docs quality

- Keep `README.md` and supporting docs synchronized with code behavior
- Document setup, run, test, build, and deploy commands
- Include architecture summary and env var reference table

### 10.3 README badges and metadata

README should include badges for:

- CI/build status
- Test status
- Key runtime/tool versions used by the app (for example Node and package manager)
- Deployment status (Vercel) when available

### 10.4 Contributor credit and license

- README must include contributor credits, including AI-assisted contribution acknowledgment for Codex
- Project license is O'SAASY (https://osaasy.dev/)
- Add a `LICENSE` file using O'SAASY text and replace placeholders (`<Year>`, `<Copyright Holder>`)
- README license section must link to the local `LICENSE` file

---

## 11. Implementation checklist

| # | Task | Priority |
|---|------|----------|
| 1 | Scaffold React + Vite project | P0 |
| 2 | Implement `storage.js` with `localStorage` | P0 |
| 3 | Implement data load with v4 migration | P0 |
| 4 | Build `AccessGate` + `api/verify-password` | P0 |
| 5 | Build `EntryView` with `ApartmentCard` + `ScoreEditor` | P0 |
| 6 | Build `CompareView` table with dual-user columns | P0 |
| 7 | Build `AddForm` | P0 |
| 8 | Implement `TopBar` with user toggle | P0 |
| 9 | Build PDF upload UI + `api/parse-pdf` via Fireworks | P0 |
| 10 | Add `.env.example` and env var docs for Vercel + Fireworks setup | P0 |
| 11 | Add GitHub Actions for lint, test, and build | P0 |
| 12 | Ensure tests pass in CI and locally before release | P0 |
| 13 | Update README/docs + add status/version badges | P0 |
| 14 | Add contributor credit and O'SAASY `LICENSE` file | P0 |
| 15 | Deploy to Vercel with required env vars | P0 |
| 16 | Make compare table columns sortable | P1 |
| 17 | Add sticky first column on compare table | P1 |
| 18 | Replace `localStorage` with Supabase adapter | P2 |
| 19 | Make user list configurable | P2 |
| 20 | SBB transit time via open data API | P3 |
