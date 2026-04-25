# Apartment reprocess — design

**Issue:** [#83 — There should be a reprocess button on the apartment page that refreshes all inferred data but keeps all user provided data as is](https://github.com/brlauuu/flatpare/issues/83)
**Date:** 2026-04-25

## Problem

After uploading a PDF and saving an apartment, the AI-extracted fields are frozen. If the user later updates the prompt logic, picks a better model, or re-uploads a clearer PDF as the same listing, there's no way to refresh the inferred data without losing whatever fields the user manually edited along the way.

## Scope

- Track which fields the user has edited via the form, persistently.
- New "Reprocess" button on the apartment detail page that re-runs `extractApartmentData` on the existing PDF.
- Reprocess updates only the AI-inferable fields that the user HAS NOT edited.
- Distance recomputation is NOT triggered by reprocess (the user can use the existing settings-page button).
- Out: "un-mark field as edited" UI, per-field reprocess, showing inferred-vs-edited badges next to fields.

## Edit tracking

### Storage

New nullable column on the apartments table:

```ts
// src/lib/db/schema.ts
userEditedFields: text("user_edited_fields"),
```

JSON-encoded array of field names, e.g. `'["rentChf","sizeM2"]'`. `null` and `'[]'` are equivalent (no edits tracked). Existing apartments default to `null`.

### Inferable-fields list

Extracted into `src/lib/edited-fields.ts`:

```ts
export const INFERABLE_FIELDS = [
  "name",
  "address",
  "sizeM2",
  "numRooms",
  "numBathrooms",
  "numBalconies",
  "hasWashingMachine",
  "rentChf",
  "listingUrl",
  "summary",
  "availableFrom",
] as const satisfies readonly string[];

export type InferableField = (typeof INFERABLE_FIELDS)[number];

export function diffInferableFields(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
): InferableField[] {
  const changed: InferableField[] = [];
  for (const field of INFERABLE_FIELDS) {
    if (current[field] !== incoming[field]) changed.push(field);
  }
  return changed;
}
```

The list intentionally excludes `pdfUrl`, `shortCode`, `distanceBikeMin`, `distanceTransitMin`, `rawExtractedData`, `createdAt`, `updatedAt` — those are computed or set on upload, never AI-inferred.

### PATCH route changes

`src/app/api/apartments/[id]/route.ts` PATCH handler grows a "diff and merge" step:

1. Fetch the current apartment row.
2. Compute `changed = diffInferableFields(current, body)`.
3. Parse the existing `userEditedFields` (`null` or invalid JSON → empty set).
4. Compute `merged = unique union of current set + changed`.
5. Update the row with all fields PLUS `userEditedFields: JSON.stringify(merged)`.

The response body now includes `userEditedFields` (parsed back to an array, or `[]`).

Saving the form unchanged → no fields added (correct). Editing rent → `"rentChf"` joins the set. Re-editing back to the AI's original value → still tracked as edited (the user touched it).

### POST route

POST does NOT initialize `userEditedFields`. A freshly-uploaded apartment has `null`, meaning "no edits yet — everything is AI-inferred". Reprocess at this point would happily refresh every AI field.

## Reprocess endpoint

`POST /api/apartments/[id]/reprocess`:

1. Fetch the apartment row, including `pdfUrl` and `userEditedFields`.
2. If `pdfUrl` is null, return `400 { error: "No PDF on file for this apartment" }`.
3. Server-side `fetch(pdfUrl)` → `arrayBuffer` → `Buffer.from(...).toString("base64")`.
4. Call `extractApartmentData(base64)`. Wrapped in a try/catch that runs the result through `classifyParsePdfError` on failure, returning the same `{ error, reason, retryAfterSeconds? }` shape as `/api/parse-pdf`.
5. Parse `userEditedFields` to a Set (empty if null/invalid).
6. Build the update payload: for each `field of INFERABLE_FIELDS`, if `field in extraction && !editedSet.has(field)`, copy `extraction[field]` to the payload.
7. If the payload is empty (every inferable field was edited), return the unchanged apartment with HTTP 200 — successful no-op.
8. Otherwise run `db.update(apartments).set(payload).where(eq(...))`.
9. Return the full updated apartment row.

The endpoint is idempotent — calling it twice in a row produces the same result (same PDF + same edit set + same model = same payload).

## UI

`src/app/apartments/[id]/page.tsx` action button row gets a new "Reprocess" button between Edit and Delete:

```tsx
<Button
  variant="outline"
  size="sm"
  disabled={reprocessing || editing || !apartment.pdfUrl}
  onClick={handleReprocess}
  className="w-full sm:w-auto"
>
  {reprocessing ? "Reprocessing..." : "Reprocess"}
</Button>
```

Disabled when there's no PDF on file (legacy single-entry apartments) and during edit mode.

`handleReprocess`:

```tsx
async function handleReprocess() {
  const ok = window.confirm(
    "Reprocess this apartment? Fields you haven't edited will be refreshed from the PDF. Fields you've edited will stay."
  );
  if (!ok) return;
  setReprocessing(true);
  const url = `/api/apartments/${params.id}/reprocess`;
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      setError({
        headline: "Couldn't reprocess apartment",
        details: await fetchErrorFromResponse(res, url),
      });
      return;
    }
    await reloadApartment();
  } catch (err) {
    setError({
      headline: "Couldn't reprocess apartment",
      details: fetchErrorFromException(err, url),
    });
  } finally {
    setReprocessing(false);
  }
}
```

`reloadApartment` is already in the page (used by the user-switch effect). It re-fetches and re-derives state. After reprocess, the user sees the refreshed fields immediately.

## Migration

`npm run db:generate` adds the `user_edited_fields` column (nullable, no default). `npm run db:push` applies it. Non-destructive.

## Testing

### Unit tests — `src/lib/__tests__/edited-fields.test.ts` (new, 4 tests)

1. Empty diff when all values match.
2. One changed field → set contains that field name.
3. Multiple changed fields → set contains all of them.
4. Fields outside `INFERABLE_FIELDS` (e.g. `distanceBikeMin`) are ignored even when changed.

### Integration tests — extend `edit-flow.test.tsx` (2 new tests)

5. After saving an edit that changes `name` and `rentChf`, the second `GET /api/apartments/42` (the post-save reload) returns `userEditedFields: ["name","rentChf"]` (or some order). Assert the field appears in the apartment state. (Doesn't need a UI assertion — the field tracking is server-side.)
6. Saving without changing any field results in PATCH being called but `userEditedFields` stays empty.

### Integration tests — `src/app/apartments/[id]/__tests__/reprocess.test.tsx` (new, 3 tests)

7. Click Reprocess → confirm → POST `/api/apartments/{id}/reprocess` is called → page reloads with the new fields rendered.
8. Reprocess button is disabled when `apartment.pdfUrl` is null.
9. Server returns a 429 quota error → message renders in `ErrorDisplay`.

### Existing tests

Unchanged. The PATCH route still accepts and returns the same fields; the new `userEditedFields` is additive in both directions.

## Out of scope

- "Reset edits" button to un-mark a field as edited.
- Distance recomputation as part of reprocess.
- Per-field reprocess.
- Inferred-vs-edited badges in the UI.
- Reprocessing in the upload flow (upload is already a fresh process).
- Migration to backfill `userEditedFields` for existing apartments — they default to null, meaning everything is AI-inferred, which is the correct interpretation: existing apartments will have all AI fields refreshed on first reprocess unless the user has edited them since this PR ships.

## Security & cost

- Reprocess re-runs the AI on a server-fetched PDF — same cost profile as upload, just triggered manually.
- The endpoint is gated by the existing app-wide password (the proxy guards `/api/*`). No additional auth is needed.
- `pdfUrl` may be a Vercel Blob signed URL or a public URL; the server `fetch` handles both.
