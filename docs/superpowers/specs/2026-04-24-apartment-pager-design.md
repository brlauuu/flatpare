# Apartment pager — design

**Issue:** [#62 — I want next and previous button when I'm in the apartment view](https://github.com/brlauuu/flatpare/issues/62)
**Date:** 2026-04-24

## Problem

When viewing a single apartment at `/apartments/[id]`, there's no way to move to the adjacent apartment without returning to the list first. Add Previous / Next buttons that navigate between apartments in the order set by the list page's sort controls (shipped in #61).

## Scope

One compact pager row at the top of the detail page, driven by the sort stored in localStorage. Disabled at the edges. Works on direct URL navigation (bookmarks, shared links, browser back).

## UI

Above the apartment header block (`<ShortCode>` + `<h1>`), a left-aligned row:

```
[← Previous]   3 of 17   [Next →]
```

- Two `<Button variant="outline" size="sm">` with `ArrowLeft` / `ArrowRight` from `lucide-react`.
- Position text: `"{position} of {total}"` in `text-sm text-muted-foreground`.
- Previous disabled when `prevId === null`; Next disabled when `nextId === null`.
- Click handler: `router.push(`/apartments/${prevOrNextId}`)`.
- While the list fetch is in flight, both buttons render disabled and the position text is hidden — the row holds its vertical space so the header below doesn't jump when the data arrives.

### Placements considered and rejected

- Inline with the header's action row (right side): already crowded with PDF, Listing, Edit, Delete.
- Floating fixed arrows on the viewport edges: overkill for this app.

## Data flow

Parallel to the existing single-apartment fetch, a second fetch retrieves the full list. The detail page reads the user's current sort preference from localStorage, sorts the list client-side with `compareApartments`, locates the current id, and derives prev/next.

### Sort state source

Same two keys as the list page:

- `flatpare-apartments-sort-field` (default `createdAt`)
- `flatpare-apartments-sort-direction` (default `desc`)

Read once on mount via a plain lazy `useState(() => ...)` — the detail page does not need same-tab sync, because the user cannot change sort preferences while on a detail page. Keeping the state local and synchronous avoids dragging `useSyncExternalStore` into this code path.

### Current-apartment-not-in-list edge case

If the fetched list does not contain the current `id` (apartment was just deleted on another tab, or was uploaded after the list fetch started), the pager renders both buttons disabled, position text hidden — same as the loading state visually.

### Error handling

The list fetch is a secondary data source. On failure the pager renders both buttons disabled and hides the position text — same visual state as loading. The error is not surfaced to the user; a secondary-data failure that just removes a convenience feature doesn't warrant an error banner. The existing `ErrorDisplay` continues to own the primary single-apartment fetch failure flow.

## New module: `useApartmentPager`

```ts
// src/lib/use-apartment-pager.ts
export function useApartmentPager(currentId: number): {
  loading: boolean;
  error: ErrorDetails | null;
  total: number;
  position: number | null;
  prevId: number | null;
  nextId: number | null;
};
```

- `loading: true` until the list fetch resolves.
- `error` populated only if the list fetch fails.
- `total` reflects the fetched list length (regardless of whether `currentId` is in it).
- `position` is 1-based; `null` when not found or while loading.
- `prevId` / `nextId` are the adjacent ids in sort order, or `null` at the edges / when not found / while loading.

### Internals

1. `useEffect` fetches `/api/apartments` once on mount, stores `apartments`, sets `loading` / `error`.
2. Lazy `useState` init reads both sort keys from localStorage, validates with `isSortField` / `isSortDirection`, falls back to defaults.
3. `useMemo` sorts via `compareApartments(a, b, sortField, sortDirection)`.
4. Derived values via simple array indexing.

The hook is the only new reusable unit. The detail page wires it directly — no additional component extraction.

## Refactor: shared sort-state helpers

Currently these constants and helpers live in `src/app/apartments/page.tsx`:

- `SORT_FIELD_STORAGE_KEY`, `SORT_DIRECTION_STORAGE_KEY`, `SORT_CHANGE_EVENT`
- `isSortField`, `isSortDirection`, `SORT_FIELD_IDS`

Move them into `src/lib/apartment-sort.ts` and re-export. `src/app/apartments/page.tsx` imports them from the new location. No behavior change; existing tests continue to pass.

## Testing

### New — `src/lib/__tests__/use-apartment-pager.test.tsx`

TDD for the hook. Tests render a tiny probe component, mock `global.fetch` to return a controlled 3-apartment list, seed localStorage as needed, and assert the returned values:

1. `loading: true` initially; `position: null`, `prevId: null`, `nextId: null`.
2. After fetch resolves with defaults (`createdAt` desc), `total === 3` and position matches the expected index + 1.
3. Seed `sort-field=rentChf, direction=asc` → ordering reflects that sort.
4. First apartment in order: `prevId === null`, `nextId` populated.
5. Last apartment in order: `nextId === null`, `prevId` populated.
6. Middle apartment: both populated.
7. Current id absent from the list: `position === null`, both ids `null`, `total` still equals the list length.
8. Fetch failure: `error` populated, `position === null`, `prevId === null`, `nextId === null`.

### New — `src/app/apartments/[id]/__tests__/pager.test.tsx`

Integration tests for the detail page:

1. After load, the row shows `"2 of 3"` and both buttons are enabled.
2. Clicking Next calls `router.push("/apartments/{nextId}")`.
3. On the first apartment, Previous is disabled (`aria-disabled` or the button's `disabled` attribute); Next navigates correctly.
4. On the last apartment, Next is disabled; Previous navigates correctly.

### Existing — view toggle + sort tests

Unchanged. The constants-and-helpers refactor keeps the same localStorage keys and validation behavior; existing tests import through a new path (if they import the constants directly) or don't import at all (if they use the string values), so they remain green.

## Out of scope

- No URL query-string sync of sort state — we already have localStorage.
- No keyboard shortcuts (←/→ keys). Could be added as a follow-up.
- No wrap-around at the edges — decided explicitly against it.
- No persistence of a separate "detail-page sort" — the detail page reflects whatever sort the list had.
