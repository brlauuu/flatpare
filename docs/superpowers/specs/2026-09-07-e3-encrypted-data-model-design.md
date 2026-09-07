# E3 — Encrypted data model

**Issue:** #185. **Parent:** [2026-09-01-accounts-e2ee-billing-design.md](./2026-09-01-accounts-e2ee-billing-design.md).
**Builds on:** [2026-09-06-e2-crypto-core-design.md](./2026-09-06-e2-crypto-core-design.md).
**Ships as:** one PR.

## What E3 delivers

Apartments, ratings and locations become opaque blobs, sealed in the browser
under the household data key that E2 put in `useCrypto().keys.dataKey`. The
server stores, scopes and orders rows; it can no longer read, sort, filter or
derive anything from their content. Uploaded PDFs are encrypted the same way.
Sorting, filtering, search and every join move into one client-side store.

E3 also pulls forward the *plumbing* half of E4: the four `/api/process/*`
endpoints (geocode, distance, check-listing, parse-pdf) that accept plaintext,
call the third-party API with the host's key, and return the result without
storing it. Without them, encrypting `address` would break geocoding,
distances, short codes, listing checks and PDF re-extraction. E4 keeps the
*hardening*: log-body guarantees, per-household rate limiting, negative tests
that nothing was logged, and landing-page copy.

## Deviations from the parent spec, dated 2026-09-07

| Parent spec said | E3 does | Why |
|---|---|---|
| `shortCode` is a plaintext column | Short code lives inside the encrypted apartment blob; no column | It is derived from rooms, bathrooms, washing machine and postcode — it leaks exactly what is being encrypted |
| `(…, ciphertext, iv)` columns | One `envelope` text column holding E2's `Envelope` JSON | The v0 (off-mode) form has no iv; E2 already defined the envelope as one value |
| Blind-proxy endpoints belong to E4 | E3 ships them as thin conversions of the existing lib functions | E3 does not produce working software without them |
| (not mentioned) Stored PDFs | Encrypted client-side before upload | Plaintext PDFs on Blob/disk contradicted "we never store them" |

## Data model

Migration 0014 drops `apartments`, `ratings`, `locations_of_interest` and
`apartment_distances` and creates:

```
apartments   id TEXT PK · household_id INT NOT NULL FK households · version INT NOT NULL DEFAULT 1
             · envelope TEXT NOT NULL · created_at · updated_at
ratings      household_id INT NOT NULL FK · apartment_id TEXT NOT NULL FK apartments (cascade)
             · user_id TEXT NOT NULL FK users (cascade) · envelope TEXT NOT NULL · created_at · updated_at
             PK (apartment_id, user_id)
locations    id TEXT PK · household_id INT NOT NULL FK · sort_order INT NOT NULL
             · envelope TEXT NOT NULL · created_at · updated_at
```

Indexes on `household_id` for all three. `apartment_distances` is gone;
distances live inside the apartment blob.

**What stays plaintext, and why.** Ids, household id, timestamps, `version`,
`sort_order`, and on ratings the `user_id`. These are structural: the server
needs them to route, scope, order and detect conflicts, and none of them is
user-supplied content. The host can therefore see row counts, who rated which
apartment and when, and the order of locations. This is recorded as an
accepted limit in `docs/security-notes.md`.

**Ids are client-generated UUIDs** (`crypto.randomUUID()`, which is not
`subtle` and not `getRandomValues`, so the ESLint layering rule allows it
anywhere; still, mint them through one helper `newRowId()` in
`src/lib/household-data/ids.ts`). Two reasons: the AAD
`${householdId}:${table}:${rowId}` must be known before sealing, and a PDF is
uploaded before its apartment row exists. The server validates the format
(`z.string().uuid()`) and answers `409 { error: "Duplicate id" }` on a primary
key collision.

**`version`** on apartments is bumped by the server on every successful write.
`PUT` carries the version the client read; a mismatch is
`409 { error: "Stale version", version: <current> }`. Ratings (one writer per
row) and locations (at most five, tiny) do not carry a version.

**Off mode** (`FLATPARE_ENCRYPTION=off`) uses the identical schema and routes
with `v: 0` envelopes. There is no second code path and the server still
cannot query content. `assertEnvelopeMode` on every write keeps a deployment
from mixing forms.

### Plaintext shapes — `src/lib/household-data/types.ts`

These are what the client seals. They are the only place field names live;
the server never sees them.

```ts
export interface ApartmentDistance { bikeMin: number | null; transitMin: number | null }

export interface ApartmentPdf { path: string; iv: string | null }   // iv null in off mode

export interface Apartment {
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  listingUrl: string | null;
  summary: string | null;
  availableFrom: string | null;          // ISO date, validated client-side
  shortCode: string | null;
  rawExtractedData: unknown | null;
  userEditedFields: string[];
  latitude: number | null;
  longitude: number | null;
  listingGone: boolean | null;
  listingCheckedAt: string | null;       // ISO timestamp
  distances: Record<string, ApartmentDistance>;   // keyed by location id
  pdf: ApartmentPdf | null;
}

export interface Rating {
  kitchen: number; balconies: number; location: number; floorplan: number;
  overallFeeling: number; comment: string;
}

export interface Location {
  label: string;
  icon: string;                          // validated by isLocationIconName client-side
  address: string;
  latitude: number | null;
  longitude: number | null;
}
```

Zod schemas for all three sit beside the types (`schemas.ts`) and are applied
in `open()`'s caller, so a decrypted blob that does not match its schema is
treated as corrupt rather than propagated.

### Envelope wire shape — `src/lib/household-data/wire.ts`

```ts
export interface ApartmentRow { id: string; version: number; envelope: Envelope; createdAt: string; updatedAt: string }
export interface RatingRow    { apartmentId: string; userId: string; userName: string | null; envelope: Envelope; updatedAt: string }
export interface LocationRow  { id: string; sortOrder: number; envelope: Envelope; createdAt: string; updatedAt: string }
```

`userName` on ratings is resolved server-side by joining `users`, as today —
it is account metadata, not household content.

`src/lib/crypto-schemas.ts` gains `envelopeSchema`: a discriminated union on
`v` with `iv`/`ct` as base64 strings for v1 and `data: unknown` for v0. Every
write route parses the body through it before `assertEnvelopeMode`.

## Server API

Every data route, read or write:
`requireHousehold()` → `assertMembership(householdId, userId)` against the
database → `parseBody(schema)` → for writes `assertEnvelopeMode(envelope,
readEncryptionMode())` → query scoped on `household_id`. Errors map through
`apiErrorResponse` (`src/lib/api-route.ts`). A row in another household is a
404, never a 403.

Membership is re-checked **on reads too**. E2 documented why: a removed
member's JWT stays valid for up to 24h and they may still hold a cached data
key, so the ciphertext itself has to become unfetchable at removal time. One
indexed query per request.

```
GET    /api/apartments                          → ApartmentRow[]
POST   /api/apartments        {id, envelope}    → 201 ApartmentRow · 409 Duplicate id
PUT    /api/apartments/:id    {envelope, version} → ApartmentRow · 409 Stale version
DELETE /api/apartments/:id    {pdfPath?}        → 204; cascades ratings; deletes the file if pdfPath given

GET    /api/ratings                             → RatingRow[]   (whole household)
PUT    /api/apartments/:id/ratings/me {envelope} → RatingRow    (upsert caller's row)

GET    /api/locations                           → LocationRow[] ordered by sort_order
POST   /api/locations         {id, envelope}    → 201 · 409 Duplicate id · 409 Too many locations (MAX_LOCATIONS = 5)
PUT    /api/locations/:id     {envelope}        → LocationRow
DELETE /api/locations/:id                       → 204; renumbers sort_order
POST   /api/locations/:id/move {direction: "up" | "down"} → LocationRow[]   (unchanged semantics)
```

`DELETE /api/apartments/:id` accepts an optional `pdfPath` because the server
cannot read the blob to learn it. The path must resolve, via the existing
`storedPathHousehold` logic, to the caller's household; otherwise 400. The row
is deleted first; a failed file deletion is logged and does not fail the
request (an orphaned ciphertext file is harmless).

`src/lib/locations.ts` shrinks to household-scoped CRUD over envelopes plus
`moveLocation`; the geocode-on-save it does today moves to the client. The
tenancy rules at the top of that file stay.

### Removed routes

| Route | Replaced by |
|---|---|
| `GET /api/apartments/:id` | the store holds every row |
| `POST /api/apartments/check-listings` | client loop over `/api/process/check-listing` |
| `POST /api/apartments/:id/reprocess` | client: decrypt PDF → `/api/process/parse-pdf` → `PUT` |
| `POST /api/geocode/backfill` | client `runMaintenance("geocode")` |
| `POST /api/settings/recompute-distances` | client `runMaintenance("distances")` |
| `POST /api/parse-pdf` (store + extract) | `/api/process/parse-pdf` (extract only) + `/api/files` (store ciphertext) |

`GET /api/parse-pdf/upload-token` stays: it mints the client-direct Blob
upload token, now for ciphertext. It moves to `GET /api/files/upload-token`.

## Process endpoints — `src/app/api/process/*`

Thin wrappers over existing lib functions. Each: `requireHousehold()` →
`assertMembership()` → `parseBody(schema)` → call → return. **They touch no
table**, and each has a test that asserts every table's row count is unchanged
after the call. A comment at the top of each handler states the privacy
exception in the parent spec's words.

```
POST /api/process/geocode        {address: string}
  → { lat: number, lng: number, postcode: string | null }
  → { lat: null, lng: null, postcode: null, reason: string }      (geocodeLatLngWithReason's reason)
POST /api/process/distance       {from: string, to: string}
  → { bikeMin: number | null, transitMin: number | null }          (calculateDistance)
POST /api/process/check-listing  {url: string}
  → { gone: boolean | null }                                        (checkListingUrl)
POST /api/process/parse-pdf      multipart `file` (application/pdf)
  → { extracted, aiAvailable: boolean }                             (extractApartmentData; emptyExtraction when no key)
```

- `geocode` returns the postcode so the client derives the short code from
  one round-trip. `extractPostcode` becomes an internal of `geocode.ts` used
  by this route; the separate Maps request it makes today is folded into the
  same handler.
- `check-listing` is one URL per call. It adds a scheme allowlist
  (`http:`/`https:`) now, because the trust boundary is the one #199
  describes; the private-address block stays with #199.
- `parse-pdf` is multipart plaintext straight to the function. The route
  caps the file at `PARSE_PDF_MAX_BYTES` (env, default 20 MB) and answers
  `413 { error: "PDF too large to extract" }` above it. Whatever the
  platform's own body limit turns out to be produces the same outcome on the
  client: any non-2xx from `parse-pdf` falls back to manual entry **while
  still storing the encrypted PDF** (the ciphertext upload goes client-direct
  to Blob and has no such limit). There is deliberately no plaintext scratch
  blob.

Deleted: `src/lib/map-embed.ts` and the Google Maps Embed iframe on the
apartment page. That URL was built server-side from the plaintext address and
carried the Maps key. The detail page renders the Leaflet map already used on
the overview, from `latitude`/`longitude` alone.

## Encrypted files — PDFs

`src/lib/crypto/bytes.ts`, exported through `@/lib/crypto`:

```ts
export interface SealedBytes { iv: string | null; ct: Uint8Array }
export function sealBytes(key: CryptoKey | null, bytes: Uint8Array, aad: string): Promise<SealedBytes>
export function openBytes(key: CryptoKey | null, sealed: SealedBytes, aad: string): Promise<Uint8Array>
```

AES-256-GCM over the raw bytes with the AAD as additional data, no JSON, no
base64 of the payload. With `key === null` (off mode) the bytes pass through
and `iv` is `null`; `openBytes` with a non-null key and a `null` iv throws.
AAD for a PDF is `envelopeAad(householdId, "pdf", apartmentId)`.

**Upload.** `src/lib/upload-pdf.ts` becomes `uploadEncryptedFile(bytes: Uint8Array, apartmentId: string): Promise<string /* path */>`:
- Cloud: client-direct Blob upload (existing `handleUpload` token flow) with
  `contentType: "application/octet-stream"` to
  `households/<householdId>/<apartmentId>.pdf.enc`.
- Local: `POST /api/files` multipart; the server writes under
  `data/uploads/households/<householdId>/` exactly as `uploadFile` does today.

Both return the `/api/pdf/<path>` URL the client stores as `pdf.path`.

**Read.** `GET /api/pdf/[...path]` is unchanged — household-scoped bytes —
and now serves ciphertext. "View PDF" fetches, `openBytes`, and opens a
`blob:` URL in a new tab. "Reprocess" decrypts and POSTs the plaintext to
`/api/process/parse-pdf`, then updates the apartment through the store.

**New-apartment flow.** The page mints `apartmentId` first. Then, in
parallel: send plaintext to `/api/process/parse-pdf` for extraction, and seal +
upload the ciphertext. When both settle the form is prefilled and `pdf` is
set; on create the blob carries `{path, iv}`. If the upload fails the create
proceeds with `pdf: null` and a visible notice; if extraction fails the form
opens empty (manual entry) with the PDF still attached.

## Client — `HouseholdDataProvider`

```
src/lib/household-data/            pure, no React
  types.ts · schemas.ts · wire.ts · ids.ts
  codec.ts      sealApartment/openApartment, sealRating/openRating, sealLocation/openLocation
                (each takes key, householdId, rowId; open validates with the zod schema)
  derive.ts     deriveApartments(apartments, ratings, userId): ApartmentView[]
  enrich.ts     planEnrichment(before, after): which of geocode/distances/shortCode to run
  short-code.ts buildShortCode(parts, letters) + pickLetters (moved from src/lib/short-code.ts, minus the Maps call)
src/components/household-data/
  household-data-provider.tsx · use-household-data.ts · maintenance.ts
```

`src/lib/household-data` imports from `@/lib/crypto` and nothing under
`app/` or `components/`. `src/components/household-data` imports from
`@/lib/household-data`, `@/lib/crypto`, and `@/components/crypto` (for
`useCrypto`). This layering is pinned in the enola baseline.

### Views

```ts
export interface RatingView extends Rating { userId: string; userName: string | null; updatedAt: string }
export interface ApartmentView extends Apartment {
  id: string; version: number; createdAt: string; updatedAt: string;
  ratings: RatingView[];
  avgKitchen: number | null; avgBalconies: number | null; avgLocation: number | null;
  avgFloorplan: number | null; avgOverall: number | null;
  myRating: number | null;               // caller's overallFeeling
  corrupt?: true;                        // envelope could not be opened; other fields are defaults
}
export interface LocationView extends Location { id: string; sortOrder: number }
```

`apartment-sort.ts`'s `SortableApartment` is retyped onto `ApartmentView`
(`avgOverall` becomes a number; `distances` becomes the record). Sorting,
filtering and search are array operations on `apartments`.

### Hook

```ts
useHouseholdData(): {
  status: "loading" | "ready" | "error"; error: string | null;
  apartments: ApartmentView[]; locations: LocationView[];
  reload(): Promise<void>;
  createApartment(id: string, data: Apartment): Promise<ApartmentView>;
  updateApartment(id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView>;
  deleteApartment(id: string): Promise<void>;
  rateApartment(id: string, rating: Rating | null): Promise<void>;
  createLocation(id: string, data: Location): Promise<LocationView>;
  updateLocation(id: string, mutate: (l: Location) => Location): Promise<LocationView>;
  deleteLocation(id: string): Promise<void>;
  moveLocation(id: string, direction: "up" | "down"): Promise<void>;
  runMaintenance(kind: "geocode" | "distances" | "listings", onProgress?: (done: number, total: number) => void): Promise<MaintenanceReport>;
}
```

- **Mount.** `CryptoGate` renders `<CryptoProvider mode>` → `<HouseholdDataProvider>` → children. `CryptoProvider` already renders its own screens instead of children until `unlocked` or `off`, so the store only ever exists with a usable key (`useCrypto().keys?.dataKey ?? null`).
- **Load.** Three parallel GETs; every envelope is opened with its AAD and validated; `deriveApartments` joins. A row that fails to open or validate becomes `{…defaults, id, corrupt: true}` — rendered as a placeholder card with a delete action, so one bad row cannot blank the list. The reason is logged to the console, never sent anywhere.
- **Writes** are `mutate → seal → request → replace in cache`. `updateApartment` seals the mutated *cached* plaintext and sends the cached `version`. On `409 Stale version` it refetches that row (via `GET /api/apartments`, filtered), re-applies the mutator, retries once, then throws. Ratings and locations have no version.
- **Enrichment.** After `createApartment`, and after any `updateApartment` where `planEnrichment` reports the address changed, the store runs: `geocode` → sets `latitude/longitude` and derives `shortCode` (`buildShortCode` with the postcode; re-rolled letters until unique within the household's cached list) → `distance` for each location → one more `updateApartment` with all of it. The row is visible immediately; enrichment fills in seconds later, matching today's post-insert behaviour. A failed enrichment leaves the row saved and flags it (`enrichmentError` in a per-id map on the context) with a retry action; nothing is lost.
- **Locations.** `createLocation`/`updateLocation` geocode the location's address first (needed for its own coordinates), then, if the address changed, run `runMaintenance("distances")` for that location across all apartments.
- **`runMaintenance`** is the client-side replacement for the three deleted batch routes, in `maintenance.ts`: iterate the cached apartments, call the process endpoint(s), `updateApartment` each touched row, report `{ updated, skipped, failed: {id, reason}[] }`. `listings` runs on
  list-page mount for every apartment with a `listingUrl`, as today, but only
  writes rows whose `listingGone` actually changed — otherwise a page load
  would re-seal every apartment.
- **Lock.** `lock()` in the crypto menu flips `CryptoProvider` out of `unlocked`, which unmounts the store and its plaintext. Nothing extra to wire.

### Pages

`apartments/page.tsx`, `apartments/[id]/page.tsx`, `apartments/new/page.tsx`,
`compare/page.tsx`, `settings/page.tsx`, `lib/use-apartment-pager.ts` and
`components/apartments-overview-map.tsx` stop calling `fetch` and read the
hook. `apartments/[id]` finds its row in the cache and renders the existing
not-found UI if absent. The detail page's ratings panel calls `rateApartment`;
the edit form calls `updateApartment` with a mutator built from the form
diff (`diffInferableFields` keeps working on plaintext).
`household-settings.tsx` (members, invitations) is untouched — not household
content. `lib/short-code.ts` is deleted in favour of
`lib/household-data/short-code.ts`.

Ids become strings throughout the page and component types (`ApartmentDetail`,
`compare-types.ts`, `apartment-sort.ts`).

## Errors

Server, through `apiErrorResponse`: `400` schema / envelope-mode mismatch /
foreign `pdfPath`; `404` unknown or foreign row; `409 Duplicate id`;
`409 Stale version` with the current version; `409 Too many locations`;
`413` oversized PDF on `parse-pdf`.

Client: decrypt failures are per-row (corrupt placeholder). Enrichment and
maintenance failures are per-row and retryable. A `409 Stale version` is
retried once transparently. Any other write failure throws to the page, which
shows it through the existing `error-display` component and leaves the cache
unchanged.

## Testing

Vitest, in-memory libSQL via `applyMigrations(client, { encryptionMode })`,
Node WebCrypto. Tests that need a data key generate one with
`generateDataKey()`; none need Argon2id.

- `src/lib/crypto/__tests__/bytes.test.ts`: round-trip, tamper detection,
  wrong-AAD rejection, off-mode passthrough, `null` iv with a key throws.
- `src/lib/household-data/__tests__/`: codec round-trip per row type; an
  apartment envelope opened under another apartment's id, another household,
  or another table fails; a decrypted blob failing its schema is reported as
  corrupt; `deriveApartments` averages, `myRating`, ratings ordering;
  `planEnrichment`; short-code building and uniqueness re-roll.
- Route tests, one file per route, each including the cross-household case
  (404, no row written or deleted) — the test the parent spec names as the
  one that stops the worst bug. Plus: duplicate id 409; stale version 409
  carrying the current version and leaving the row unchanged; ratings upsert
  only touches the caller's row; `MAX_LOCATIONS` 409; a member whose
  membership row was deleted (JWT still valid) gets 404 on `GET` routes;
  `v:0` envelope under `on` (and `v:1` under `off`) rejected with 400 before
  any write; `DELETE` with a foreign `pdfPath` is 400 and deletes nothing.
- Process routes: schema validation; the wrapped lib function is called with
  the plaintext and its result returned verbatim; every table's row count is
  unchanged after the call; `check-listing` rejects `file:` and `ftp:` URLs.
- Provider: rendered under a hand-built `CryptoContext` value with a real
  `CryptoKey` and a mocked `fetch`: load → decrypted views; a corrupt row
  becomes a placeholder while others load; `updateApartment` sends a sealed
  body with the cached version and applies the response; the 409 path retries
  once with the refetched version; enrichment runs geocode → distances → PUT
  in order; unmount drops state.
- Pages: existing page tests are rewritten to render under a fake
  `HouseholdDataContext` value instead of mocking `fetch`.
- Migration: 0014's preflight refuses on a non-empty old table, naming it, and
  applies on an empty or fresh database; the new tables exist afterwards.
- Coverage floors unchanged (lines/statements ≥ 80, functions ≥ 78, branches
  ≥ 75). The E2 ESLint layering rule already fences `crypto.subtle`;
  `bytes.ts` lives under `src/lib/crypto/`.

## Rollout, docs, architecture

**Migration 0014** and its preflight. `src/lib/db/migrate.ts` gains
`preflightEncryptedModelMigration(client)`: if 0014 has not run (detected by
`apartments.envelope` missing from `PRAGMA table_info`) and any of the four old
tables holds rows, throw an error naming the tables and stating that no
migration was applied. The four legacy runtime backfills
(`ensureListingUrlColumn`, `reconcileHasWashingMachine`, `backfillShortCodes`,
`migrateLocationsOfInterestBackfill`) are deleted — they act on columns that
no longer exist, and a fresh database needs none of them.
`preflightTenancyMigration` stays (it protects the same upgrade path one step
earlier). The hosted database is wiped by hand before deploying, the same
posture as E1; deployment itself stays deferred. Known limit, unchanged by
E3: `scripts/vercel-build.mjs` runs `drizzle-kit migrate` at build time and
bypasses runtime preflights (#211).

**Docs.** `AGENTS.md`: a `## Data (E3)` section — the blob shape and where
field names live, the AAD convention, UUID ids via `newRowId()`, `version`
semantics, the rule that `/api/process/*` never writes, the encrypted-PDF path
and the removed routes; the File uploads section rewritten for ciphertext
uploads; the Encryption section's layering bullet extended with
`household-data`. `docs/security-notes.md`: an "Encrypted data — reviewed
2026-09-07" section with the accepted limits: visible metadata (row counts,
timestamps, who rated what, location order, PDF sizes); whole-row
last-write-wins after one version retry; process endpoints see plaintext in
memory (the documented exception, hardened in E4); a removed member's cached
key can still open ciphertext they fetched before removal (rotation is #219).
The parent spec gets the dated deviations table above as a note.

**enola.** `set_baseline` before Task 1. Intended layering:
`components/household-data → lib/household-data → lib/crypto`;
`lib/household-data` imports nothing from `app/` or `components/`; routes
import `lib/household-data/wire` types only. Re-pin at the end; grade with
`enola check --fail-on=cycles`.

**Issues.** #185 closes with the PR. #186 gets a comment listing what E3
delivered so E4 is scoped to hardening. #199 stays open for the
private-address block. #219 (key rotation) is unaffected.

## Out of scope

Rate limiting and log guarantees on process endpoints (E4); tier limits
(E5); encrypted export/import (#191); data-key rotation (#219); any
server-side search or index over content — by design there is none.
