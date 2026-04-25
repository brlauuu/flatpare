# Apartment "available from" date — design

**Issue:** [#55 — Add parsing of "available from date" if available. Make it editable field.](https://github.com/brlauuu/flatpare/issues/55)
**Date:** 2026-04-25

## Problem

Listings often state when the apartment is available (e.g. "Bezugstermin: 01.05.2026", "verfügbar ab 1. Mai 2026"). Today the parser ignores this and there's no field for it on the apartment detail. The user wants the date extracted automatically AND editable in case the AI gets it wrong or the listing didn't include one.

## Scope

- DB column `available_from` (`text`, nullable, ISO `YYYY-MM-DD`).
- Migration generated and applied via Drizzle.
- AI extraction reads availability phrases and returns ISO format. "ab sofort" / "per sofort" / "immediately" → `null`.
- Detail page shows the date in Swiss format below the existing summary rows; editable via the existing edit form.
- List card and compare view are unchanged (per the user's choice).

## Storage

`text` column over a timestamp because:

- The data is a calendar date, not an instant. `<input type="date">` produces ISO `YYYY-MM-DD`. Storing the same string roundtrips trivially.
- SQLite + Drizzle's `integer({ mode: "timestamp" })` stores epoch seconds, which loses the "no time" intent and introduces UTC-vs-local confusion.
- No date arithmetic happens server-side. Comparisons (sort by available date later, if needed) work fine on ISO strings.

```ts
// src/lib/db/schema.ts
availableFrom: text("available_from"),
```

Migrations:

- `npm run db:generate` — Drizzle creates a new SQL file under `drizzle/`.
- `npm run db:push` — applies the schema to the local SQLite DB. (Production runs the same.)

## Server-side validation

AI returns whatever it produces. The route's PATCH and POST handlers run a tiny `isIsoDate(s: string): boolean` check (`/^\d{4}-\d{2}-\d{2}$/`) and drop the value to `null` if it doesn't match. We accept the string verbatim (no `Date` object roundtrip) once it passes the regex.

```ts
function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
```

Defense-in-depth: protects against AI hallucinations like `"ab sofort"`, `"01.05.2026"`, or empty strings being accepted as dates.

## AI extraction

Schema addition (in BOTH `apartmentExtractionSchema` and `internalApartmentExtractionSchema`):

```ts
availableFrom: z
  .string()
  .nullable()
  .describe(
    "Move-in / availability date in ISO format YYYY-MM-DD if a specific date is given " +
    "(e.g. 'Bezugstermin: 01.05.2026' → '2026-05-01', '1. Mai 2026' → '2026-05-01'). " +
    "null if not mentioned, or if the listing says 'ab sofort' / 'per sofort' / 'immediately'."
  ),
```

Prompt addition (appended to the existing extraction prompt):

> For `availableFrom`: parse Swiss / German / English availability phrases like "Bezugstermin: 01.05.2026", "verfügbar ab 1. Mai 2026", "available from May 1, 2026" into ISO format `YYYY-MM-DD`. If the listing says "ab sofort", "per sofort", "immediately", or similar (meaning available now without a specific date), return null. If no availability info is mentioned, return null.

The AI handles the date-string variety. We don't add a server-side date parser — the formats (`DD.MM.YYYY`, `1. Mai 2026`, `May 1, 2026`, `5/1/2026`) are exactly what an LLM does well, and a regex would miss half of them.

## API & form types

Touch every type that mirrors the apartment shape:

- `ApartmentForm` (in `src/components/apartment-form-fields.tsx`): add `availableFrom: string` (empty string when not set).
- `emptyApartmentForm`: `availableFrom: ""`.
- `formFromExtracted`: copy `availableFrom`, defaulting to `""`.
- `ApartmentLike`: add `availableFrom: string | null`.
- `formFromApartment`: copy `availableFrom`, defaulting to `""`.
- `formToPayload`: emit `availableFrom: form.availableFrom || null`.
- `ApartmentDetail` (in `src/app/apartments/[id]/page.tsx`): add `availableFrom: string | null`.
- `ApartmentSummary` (in `src/app/apartments/page.tsx`): NOT needed — list card doesn't show it (per Q1).
- `ApartmentWithRatings` (in `src/app/compare/page.tsx`): NOT needed — compare view doesn't show it.

API routes:

- `src/app/api/apartments/route.ts` (POST): accept `availableFrom` from request body, validate with `isIsoDate`, insert into the apartments row.
- `src/app/api/apartments/route.ts` (GET): explicitly select `availableFrom` (the existing list query enumerates fields).
- `src/app/api/apartments/[id]/route.ts` (PATCH): accept `availableFrom`, validate, update.
- `src/app/api/apartments/[id]/route.ts` (GET): already uses `select()` (full row) — once the schema column exists, the value flows through automatically.

`isIsoDate` lives in a tiny helper module — `src/lib/iso-date.ts` — so both the POST and PATCH routes can import it.

## UI

### Detail page read-only summary

Add one row below the existing distance rows:

```tsx
{apartment.availableFrom && (
  <div className="text-sm text-muted-foreground">
    Available from: {formatSwissDate(apartment.availableFrom)}
  </div>
)}
```

`formatSwissDate(iso)` is a tiny helper: `iso.split("-").reverse().join(".")` — guarantees `2026-05-01` → `01.05.2026`. Lives in `src/lib/iso-date.ts` next to `isIsoDate`. Hidden when `availableFrom` is null.

### Edit form (`ApartmentFormFields`)

New field rendered between the existing rent and the bike/transit fields (or wherever fits the visual order):

```tsx
<div className="space-y-1.5">
  <Label htmlFor={`${idPrefix}-availableFrom`}>Available from</Label>
  <Input
    id={`${idPrefix}-availableFrom`}
    type="date"
    value={form.availableFrom}
    onChange={(e) => onChange("availableFrom", e.target.value)}
  />
</div>
```

Native `<input type="date">` works on desktop and mobile. Value format is ISO `YYYY-MM-DD`, matching storage and AI output.

### List card and compare view

Unchanged.

## Testing

### Unit tests

`src/lib/__tests__/iso-date.test.ts` (new, 5 tests):

1. `isIsoDate("2026-05-01")` → `true`.
2. `isIsoDate("01.05.2026")` → `false`.
3. `isIsoDate("ab sofort")` → `false`.
4. `formatSwissDate("2026-05-01")` → `"01.05.2026"`.
5. `formatSwissDate("2026-12-31")` → `"31.12.2026"`.

`src/lib/__tests__/parse-pdf.test.ts` (extend, 5 new tests):

6. Schema accepts `availableFrom: "2026-05-01"`.
7. Schema accepts `availableFrom: null`.
8. Schema rejects `availableFrom: 12345` (non-string).
9. AI returns `availableFrom: "2026-05-01"` → result has the same value.
10. AI returns `availableFrom: null` → result has `null`.

### Integration tests

Extend `src/app/apartments/[id]/__tests__/edit-flow.test.tsx` with 2 tests:

11. **Read-only display when set** — fixture with `availableFrom: "2026-05-01"`; assert `01.05.2026` text appears.
12. **Edit round-trips the date** — open the edit form, change the date input to `2026-07-15`, save; assert the PATCH body has `availableFrom: "2026-07-15"`.

The existing edit-flow fixture currently uses `id: 42` and various null fields; adding `availableFrom: "2026-05-01"` to the V1 fixture and `availableFrom: "2026-07-15"` to V2 lines up the existing "save flips name + rent + washing" test with one more field.

### No new upload-page test

The upload flow already mocks the parse-pdf response and tests retry/status transitions. Adding a `availableFrom` assertion would be low-value; the `formFromExtracted` field copy is covered by the parse-pdf tests indirectly.

### Existing tests

All unchanged. No fixture updates outside `edit-flow.test.tsx`. The list, compare, pager, retry, search tests don't touch `availableFrom`.

## Out of scope

- Sortable / filterable on availability date (could be a future enhancement).
- Showing the date on the list card or compare view (rejected per Q1).
- Calendar UI components beyond native `<input type="date">`.
- Localized date format toggling (Swiss `DD.MM.YYYY` is hardcoded — matches the listings).
- Auto-set "ab sofort" → today's date (deliberately left null for the user to fill in).
