# Configurable train-station address — design

**Issue:** [#56 — Bike transit to the train station is not correct. I need setting where I can set the address of the train station](https://github.com/brlauuu/flatpare/issues/56)
**Follow-up:** [#85 — Locations of interest](https://github.com/brlauuu/flatpare/issues/85)
**Date:** 2026-04-25

## Problem

`src/lib/distance.ts` hardcodes `BASEL_SBB = "Basel SBB, Switzerland"` and `BASEL_SBB_COORDS = { lat: 47.5476, lng: 7.5897 }`. Bike / transit minutes for every apartment are computed from this fixed origin. The user wants to set their own reference station and recompute existing apartments after the change.

## Scope

- App-wide setting (one shared station for all users — Alice, Bob, etc.).
- Just the address as a string. No manual coords. No per-user override. No per-apartment override.
- New `/settings` page for editing.
- "Recompute all" button on the same page that re-runs distance for every apartment.
- Default falls back to the existing `"Basel SBB, Switzerland"` so behavior is unchanged on first deploy until the user changes it.
- "Locations of interest" (multi-location with icons) is **deferred to #85**.

## Storage

Generic key-value table — extensible to future settings without further migrations.

```ts
// src/lib/db/schema.ts
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});
```

Single key in this PR: `"station_address"`. Helpers in `src/lib/app-settings.ts`:

```ts
const DEFAULT_STATION_ADDRESS = "Basel SBB, Switzerland";

export async function getStationAddress(): Promise<string> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "station_address"))
    .limit(1);
  return row[0]?.value ?? DEFAULT_STATION_ADDRESS;
}

export async function setStationAddress(value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error("Station address cannot be empty");
  await db
    .insert(appSettings)
    .values({ key: "station_address", value: trimmed })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: trimmed, updatedAt: new Date() },
    });
}
```

`getStationAddress` is the only function the distance lib calls. `setStationAddress` is called only by the `/api/settings` route.

## Distance lib

`src/lib/distance.ts`:

- Delete `BASEL_SBB` and `BASEL_SBB_COORDS` constants.
- `calculateDistance(address)` calls `await getStationAddress()` first to get the station, then forwards.
- **Google Maps path:** the existing `fetchGoogleDistance` accepts `origins` as a string. We pass the station address directly. No geocoding needed.
- **ORS path:** `geocodeWithORS` already exists for the destination; reuse it for the station address. One extra ORS call per distance computation; acceptable. No caching in this PR — if it becomes a problem, an in-memory `Map<address, coords>` cleared on settings change is a one-line fix later.
- The signature of `calculateDistance(address: string)` does not change. Callers (the distance API route) work without modification.

## Settings page UI

New route `/settings` with the standard layout:

```
Settings                                    [NavBar]
─────────────────────────────────────
Train station address
[__________________________________________]
[Save]

─────────────────────────────────────
Recompute distances
N apartments. Recomputing rebuilds bike/transit
minutes using the current station address.
[Recompute all]
[result message — empty until first run]
```

### Components

- **Address input:** shadcn `<Input>`. Pre-filled with the value from `GET /api/settings`. `aria-label="Station address"`.
- **Save button:** disabled when the input is empty (after trim) OR when the value matches the loaded value (no changes). Otherwise enabled. On click: `PUT /api/settings`. Shows a transient "Saved" message on success, or an error message on failure.
- **Recompute button:** always enabled. On click: `POST /api/settings/recompute-distances`. Shows a spinner ("Recomputing…") while the request is in flight. On completion, renders `"Recomputed K of N apartments"` (or the error message). Sequential server-side iteration so we don't hit rate limits.
- **No progress bar.** A personal app with ~20 apartments × 2 distance modes × ~1s/call = ~40s wait. Acceptable; the spinner is enough.

### Layout

`src/app/settings/layout.tsx` mirrors `src/app/apartments/layout.tsx` (server component reading the cookie for the NavBar's username prop, then renders `<NavBar userName={...} />` and the page).

`src/app/settings/page.tsx` is the client component with the form + recompute UI.

NavBar gets `/settings` added to `navItems` (between "Costs" and "Guide" — alphabetical-ish ordering).

## API routes

Three new endpoints under `src/app/api/settings/`:

### `GET /api/settings`

Returns `{ stationAddress: string }`. Always succeeds; defaults if no row.

### `PUT /api/settings`

Body: `{ stationAddress: string }`. Trims the input, validates non-empty, calls `setStationAddress`. Returns the saved value `{ stationAddress }`. 400 on empty / non-string input.

### `POST /api/settings/recompute-distances`

Iterates `apartments` rows sequentially. For each apartment with a non-null `address`, calls `calculateDistance(address)` and writes the result back. Returns `{ updated: number, failed: number, total: number, skipped: number }`. `skipped` counts apartments with null address (can't compute). `failed` counts apartments where the distance call returned `{ bikeMinutes: null, transitMinutes: null }` for both. No streaming response; the request blocks until done.

## Testing

### Unit tests — `src/lib/__tests__/app-settings.test.ts` (new, 4 tests)

Use the existing in-memory test DB pattern:

1. `getStationAddress` returns the default when the table is empty.
2. `setStationAddress` then `getStationAddress` returns the saved value.
3. Calling `setStationAddress` twice keeps a single row (upsert behavior).
4. `setStationAddress("")` throws.

### Integration tests — `src/app/settings/__tests__/settings-page.test.tsx` (new, 4 tests)

Mock `global.fetch`:

1. Loads the existing setting on mount and shows it in the input.
2. Save button is disabled when the input is empty.
3. Save button is disabled when the input matches the loaded value (no diff).
4. Clicking Recompute calls the recompute endpoint and renders `"Recomputed N of M apartments"`.

### No new distance.ts tests

The existing distance code has no tests. Adding mocked-fetch tests for two providers + geocoding is a bigger lift than warranted for this PR. End-to-end behavior is exercised on the Vercel preview by the user (typing an address, checking computed values).

### Existing tests

No changes. None of the apartments-list / detail / compare / pager / search / retry / edit-flow tests reference the hardcoded constants or the distance lib internals.

## Migration & rollout

- `npm run db:generate` creates a migration adding the `app_settings` table.
- `npm run db:push` applies it locally.
- Existing apartments keep their old `distanceBikeMin` / `distanceTransitMin` values.
- After deploy, the user opens `/settings`, types their real station address, saves, and clicks "Recompute all" once. Existing apartments get fresh distances.

## Out of scope (deferred to #85)

- Multi-location with icons.
- Per-user station settings.
- Per-apartment station overrides.
- Live progress bar during recompute.
- Caching geocoded coords.
- Streaming response from the recompute endpoint.

## Security notes

- Settings table is app-wide; no per-user authorization is needed (the existing password gate at `/` covers the whole app).
- `setStationAddress` trims whitespace and rejects empty strings.
- The recompute endpoint is idempotent and rate-limited indirectly by sequential iteration; an attacker triggering it would just incur API costs equivalent to a normal user clicking the button.
