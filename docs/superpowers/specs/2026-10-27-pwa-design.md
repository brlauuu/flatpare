# Flatpare as a proper PWA (#190, first step)

Status: design, 2026-10-27. Supersedes nothing; #190 stays open as the native-app question.

## Intent

The owner wants adding an apartment from a phone to feel like using an app. The reason to want a native app (#190) is a smoother phone experience. Users still upload listing PDFs. The owner's call (2026-10-27): **make the best possible PWA first**, use it, and decide on native apps from that experience.

The concrete win is the phone's share sheet: from a listing app or the browser, share a PDF or a link straight into Flatpare. Around that: installing the app, opening PDFs with it, and a pass over every screen at phone width.

Scope: **hosted and self-hosted alike.** Nothing here depends on a hosted-only service or env var.

## Decisions taken with the owner

1. **A narrow service worker** receives shares. It keeps a shared PDF on the phone until the page encrypts it. It never caches pages or data. This reverses the "no service worker" line in AGENTS.md (PWA section) for one purpose only. The original reason, a stale cached shell being a hard failure, does not apply to a worker that caches nothing.
2. **iPhones cannot share into a web app; accept and measure.** Make the in-app path fast on iPhone (pick a PDF from Files, paste a link). How much iPhone users miss the share sheet is the main evidence for or against native.
3. **A shared link without a PDF becomes a draft**: the link (and title, if the share carries one), to be completed later. Flatpare does not fetch or read the listing page.
4. **A draft costs no credit.** The credit is spent when the draft is completed, i.e. when it becomes an apartment through the normal create path. Drafts get their own table and their own cap so they cannot become a free way around credits.
5. **Drafts show as a "To add" strip at the top of the Apartments list.** They do not appear on the map or in Compare.
6. In this round: **install help, a phone layout pass, and "open PDFs with Flatpare"**. Not notifications.

## Goals

- On Android (installed Flatpare, Chrome), sharing a PDF from any app opens Flatpare's add flow with that PDF already in it, through the same extraction, review and encryption as an upload.
- On Android, sharing a link opens Flatpare and saves a draft in one step.
- On iPhone and everywhere else: a "Paste link" action that creates a draft from the clipboard. The PDF picker accepts several files and opens Files on iPhone (the existing upload step already uses a file input; check it says `accept="application/pdf"` and `multiple`).
- Installing is discoverable: a prompt where the browser offers one, a short how-to where it does not (iPhone Safari).
- Every signed-in screen works at 360px wide, in the installed app (no browser chrome, no browser back button), in both themes.

## Non-goals

- Offline use, caching the app, background sync.
- Push notifications.
- Any share-into-Flatpare path on iPhone (a Shortcut, an extension).
- Reading listing pages (server-side fetch, AI on HTML).
- Usage analytics. "Measure" means asking beta testers. No tracking is added.
- Drafts in export/import. Builder's call recorded below.

## Anti-goals (would be a failure even if it works)

- A shared PDF stored unencrypted on the server, even briefly. The existing `/api/process/parse-pdf` exception stays the only place the server sees a PDF, in memory, as today.
- The service worker answering any request other than the share POST. One stale cached page would be the failure the original decision was about.
- A shared item silently lost because the user had to sign in or unlock first.
- Drafts as a way to hold apartments without spending credits. A draft has no address, coordinates, distances, PDF or ratings, and cannot get any.
- A shared link reaching the server in plaintext. Drafts are sealed like every other row.

## Design

### 1. Service worker (`public/sw.js`)

- A static file served at `/sw.js`, scope `/`. Plain JavaScript, no build step, no imports. Excluded from the proxy matcher (like `manifest.webmanifest`), and served with `Cache-Control: no-cache` (`next.config.ts` `headers()`) so an updated worker is picked up on the next visit.
- `install`: `skipWaiting()`. `activate`: `clients.claim()`, then delete expired stash entries.
- `fetch`: if `request.method === "POST"` and the path is `/share-target`, call `respondWith`. Read `formData()`, store `{ id, createdAt, title, text, url, files: [File...] }` in its own IndexedDB database (`flatpare-share`; IndexedDB stores `File`/`Blob`), and answer `303` to `/apartments/new?share=<id>`. **For every other request the handler returns without calling `respondWith`**, so the browser handles it as if no worker existed. No `caches` API anywhere in the file.
- Stash entries older than 24 hours are deleted on `activate` and whenever the page reads the stash. A consumed entry is deleted once its PDFs are encrypted and saved, or its draft is created.
- Only `application/pdf` files are kept. Anything else is dropped and the page says so.
- Registration: a small client component in the root layout registers `/sw.js` when `serviceWorker` is supported. The landing page registers too, because Android only offers a share target for an installed app, and installing can happen before sign-in.
- **Server fallback:** `src/app/share-target/route.ts` handles `POST` for the case where no worker is active (first visit, worker failed). It does **not** read the body. It answers `303` to `/apartments/new?share=unavailable`, and the page asks the person to share again or use the upload button. Nothing is logged about the request.
- **Encryption key:** the stash lives in the browser, so the share itself survives the sign-in redirect and the unlock screen. `/apartments/new` sits inside the shared signed-in layout, so by the time it reads the stash the data key is available.
- **A share that loses its URL (decided by the owner, 2026-10-27): ask on next open.** The `?share=<id>` query does not survive the redirects in front of the app: the proxy sends a signed-out visitor to a bare `/`, `requirePurchase` sends an unpaid household to `/billing`, a user without a household goes to `/invitations`, and a magic link may open in another browser. So the signed-in app (a component in the shared `(app)` layout, after unlock) checks the stash on every full page load. If an unread entry exists and the page is not already handling it, it shows "Add the PDF you shared?" (or "...the link you shared?") with **Add** (go to `/apartments/new?share=<id>`) and **Discard** (delete the entry). Nothing is added without a tap, which also covers a shared phone: the next person to sign in sees the question and can discard it. **Signing out clears the stash** (the sign-out action deletes the `flatpare-share` database before calling Auth.js). Not carried through the auth or billing redirects.

### 2. Manifest (`src/app/manifest.ts`)

Add:

- `id: "/"`, `scope: "/"`.
- `share_target`: `action: "/share-target"`, `method: "POST"`, `enctype: "multipart/form-data"`, `params: { title: "title", text: "text", url: "url", files: [{ name: "pdf", accept: ["application/pdf", ".pdf"] }] }`.
- `file_handlers`: `[{ action: "/apartments/new", accept: { "application/pdf": [".pdf"] } }]`. The page reads `window.launchQueue` and passes the files into the same intake as a share. Browser support is desktop Chrome and Edge; the builder should check Android's current status and report it instead of assuming.
- `shortcuts`: one, "Add apartment" -> `/apartments/new`, in the default language (the manifest is not localised today; keep it that way).

`manifest.test.ts` asserts the new fields.

### 3. Receiving a share (`/apartments/new`)

- `?share=<id>`: read the entry from `flatpare-share`.
  - **PDFs present**: enter the existing batch flow as if the files had been dropped on the upload step (extraction -> review -> save -> encrypt and upload). If the share also carried a link, prefill `listingUrl` for every item whose extraction found none.
  - **No PDF, a link present**: create a draft (below) and go to `/apartments` with the new draft visible in the strip. The link is `url`, or else the first `http(s)://` URL found in `text`; many Android apps put the link in `text`. `title` is kept if present.
  - **Neither**: say nothing usable was shared, stay on the upload step.
  - Missing or expired id: same message as `share=unavailable`.
- `?draft=<id>`: completing a draft. The upload step shows "Attach the listing PDF" and "Fill in by hand". Both paths prefill `listingUrl` (and `name` from the title for manual entry). When `createApartment` succeeds, the draft is deleted. If the delete fails, the draft stays and can be deleted by hand; the apartment is not undone.

### 4. Drafts

**Plaintext shape** (`src/lib/household-data/types.ts`, zod in `schemas.ts`):

```ts
interface Draft { url: string; title: string | null }
```

Who shared a draft is the plaintext `created_by` column (a user id), set by the server from the session, so a member cannot attribute a draft to someone else. It reveals no more than `ratings.user_id` already does. The envelope holds the link and title only.

**Storage**: migration 0025 adds `apartment_drafts`: `id` (client UUID), `household_id`, `created_by` (users.id, set null on delete), `envelope`, `created_at`. Same rules as the other envelope tables: the server never parses the envelope; AAD `"<householdId>:drafts:<id>"`; `requireEnvelopeMode`; writes refused unless sealed under the current key (`requireCurrentKey`).

**Routes** (`src/app/api/drafts/**`): `GET /api/drafts`, `POST /api/drafts`, `DELETE /api/drafts/:id`. Every handler: `requireMember()` -> `parseBody` -> work; unknown and foreign rows are 404. No update route: a draft is created, then completed or deleted.

**Cap**: `MAX_DRAFTS = 20` per household, enforced by one conditional `INSERT ... SELECT ... WHERE count < 20` (the `createLocation` pattern, with a concurrency test; not a `db.transaction`, #225). Over the cap is `409 { error: "Too many drafts" }`. A fixed constant rather than an env var: it bounds a free row type, not something a self-hoster tunes.

**No credit, no paid call**: creating a draft calls nothing outside the app. No geocode, no distance, no listing check. `runMaintenance` ignores drafts.

**Store**: `HouseholdDataProvider` loads drafts alongside the three tables and exposes `drafts: DraftView[]`, `createDraft(url, title)`, `deleteDraft(id)`. Corrupt rows decode to a placeholder with a delete button, like corrupt apartments.

**Key rotation**: `runRotateDataKey` and `rotateHouseholdKey` must re-seal drafts with the rest. The row-set check in the transaction gains drafts. The rotation test covers a draft.

**Removing a member**: drafts they shared stay. If the creating user is deleted, `created_by` becomes null and "Shared by" shows "a former member".

**Export/import**: drafts are not exported (builder's call, below).

### 5. "To add" strip (Apartments list)

Above the cards, only when drafts exist. One compact row per draft: the title or the link's host, who shared it, when, and buttons "Add" (-> `/apartments/new?draft=<id>`) and "Delete". The link opens in a new tab. Shows nothing about credits; the credit is spent on the add page as for any apartment. A "Paste link" button sits next to "Add apartment" on the list header and on the empty state: it reads the clipboard (`navigator.clipboard.readText()`, on the tap) and creates a draft if it holds an http(s) URL, otherwise says it found no link. Where clipboard read is refused, it opens a small field to paste into.

### 6. Install help

- **Where the browser offers a prompt** (`beforeinstallprompt`, Chrome/Edge/Android): an "Install app" item in the user menu that calls `prompt()`.
- **iPhone/iPad Safari, not installed**: the same menu item opens a short how-to: Share button -> "Add to Home Screen". Detect with the user agent plus `navigator.standalone !== true`.
- **Already installed** (`display-mode: standalone` or `navigator.standalone`): no item.
- **One hint per phone**: on the Apartments list, phone width only, not installed, a dismissible line "Install Flatpare to add apartments from other apps" (wording per platform: on iPhone, mention Paste link instead of sharing). Dismissal remembered in `localStorage`, wrapped in try/catch.
- The guide gains an "On your phone" section in all five languages: installing, sharing (Android), Paste link, drafts. `guide-locales.test.tsx` holds every language to the outline as usual.

### 7. Phone layout pass

- Method: screenshot every signed-in screen at 360x780 and 390x844, light and dark, with `npm run capture:screens` (extend it to take a viewport size). Also in a `display: standalone` emulation, where the browser's back button and address bar are gone. Fix what is found, and attach before/after screenshots to the PR.
- Known items to check:
  - safe areas: `viewportFit: "cover"` in the root layout's viewport and `env(safe-area-inset-*)` padding on the nav edge and the bottom bar;
  - a way back on every screen without a browser back button (apartment detail, the add flow, Guide);
  - the on-screen keyboard covering focused fields in the add and edit forms;
  - tap targets of at least 44px in the bottom bar, card actions and the new strip;
  - the Compare table's horizontal scroll inside the installed app.

### 8. Documentation

- AGENTS.md PWA section: replace "There is deliberately no service worker" with what the worker does and does not do, and the rule that it never caches. Add Drafts to the Data (E3) section and 0025 to the migration list.
- `docs/security-notes.md`: the service worker's scope; shared PDFs held in the browser's IndexedDB until encrypted (24h expiry); links sealed like any row.
- CHANGELOG under Unreleased. This is a **minor** release (new capability, additive migration).

## Tests

- Service worker: unit-test its handler functions by exporting them for tests (load `public/sw.js` in a test with a fake `self`, `FormData` and `fake-indexeddb` if needed; the builder picks the cheapest honest harness). Must cover: POST `/share-target` stashes and redirects; any other request gets no `respondWith`; non-PDF files dropped; expiry.
- The share fallback route ignores the body and redirects.
- Intake: PDF share -> batch flow; link share -> draft; link in `text`; nothing usable; expired id; draft completion deletes the draft only after a successful create.
- Drafts: routes (membership, 404 for foreign rows, envelope mode, stale key, cap with a concurrency test), migration test, rotation re-seals drafts, no credit consumed by `POST /api/drafts`.
- Strip and Paste link: rendering, clipboard refused, non-URL clipboard.
- Install help: each of the three states.
- Pick-up on next open: Add, Discard, sign-out clears the stash.
- **On real phones, by the owner, before the sharing PR merges (decided 2026-10-27).** Vercel previews are off on purpose (and would migrate production, #212), and `npm run dev` writes to `flatpare-dev`. So Claude runs a production build (`npm run build && npm run start`) with `TURSO_DATABASE_URL=` (local SQLite file, encryption on, the `[db] local file` boot line checked) behind a temporary HTTPS tunnel (Android only installs over HTTPS), and gives the owner the address. The owner installs it on Android and adds it on an iPhone. Script: share a PDF from Files and a link from Chrome with the app locked, then signed out; Paste link and pick a PDF from Files on the iPhone. The owner reports; the PR merges after that report. The tunnel is closed and the throwaway database deleted afterwards.

## Delivery

Four PRs, each released on its own as AGENTS.md requires, in this order so that nothing ships without somewhere to go:

1. **Drafts**: migration 0025, routes, store, rotation, the "To add" strip, Paste link, completing a draft. Minor release. Useful on its own (iPhone path).
2. **Sharing**: service worker, manifest `share_target` / `file_handlers` / `shortcuts`, intake, pick-up on next open, sign-out clearing. Waits for the owner's phone test. Minor release.
3. **Install help** and the guide's "On your phone" section in five languages. Minor release.
4. **Phone layout pass.** Bounded: fix the five known items listed in section 7, and anything else that makes a screen unusable at 360px (content cut off or unreachable, a control that cannot be tapped). Everything cosmetic found on the way becomes one follow-up issue with screenshots, not part of this round. Patch release.

## Builder's calls (made by Claude, not the owner)

- Four PRs in the order above; the layout pass bounded as stated.

- `MAX_DRAFTS = 20`, a constant.
- Drafts are not exported. They are links, and a household moving instances loses at most twenty of them. Exporting them would need export format version 2.
- Stash expiry of 24 hours.
- The manifest stays in English; the shortcut label too.
- No update route for drafts.
- No analytics; "measure" means beta testers' reports.
- The landing page registers the worker too.

## Left to the builder

- The exact IndexedDB layout of the stash.
- How the service worker is tested.
- Wording, in five languages, held to the catalogue tests.
- Whether the share-target and launch-queue intake is one hook or two.
