# Compare view sort — design

**Issue:** [#63 — In the compare view, there should be a sorting option based on different parameters](https://github.com/brlauuu/flatpare/issues/63)
**Date:** 2026-04-24

## Problem

The compare view at `/compare` renders apartments as table columns with metric rows. Column order is currently determined by API response order (effectively id asc). There is no way to re-order columns by a meaningful metric, which defeats much of the point of side-by-side comparison.

## Scope

Add one pair of sort controls (field dropdown + direction toggle) to the compare page header. Ten sortable fields (the six from the apartments-list sort plus four compare-specific metrics). Independent localStorage state from the apartments-list sort. Per-browser persistence — users sharing a browser share the setting; different devices / browsers do not sync.

## UI

New header row, mirroring the apartments-list pattern:

```
Compare                          [Sort by ▾] [↑/↓]   [Show all (N hidden)]
```

- `<Select>` field dropdown with 10 items: Date added, Price, Size, Rooms, Bathrooms, Balconies, Bike to SBB, Transit to SBB, Avg rating, Short code.
- Direction toggle `<Button variant="outline" size="sm" className="h-8 w-8 p-0">` with `ArrowUp` / `ArrowDown` icon reflecting the current direction.
- `aria-label` on the direction button is the current state: `"Ascending"` when asc, `"Descending"` when desc. No `aria-pressed` (matches the decision from #61 review).
- The Select trigger is `h-8 w-[160px]` for visual alignment with the direction button.
- The existing conditional "Show all" button stays where it is, after the sort controls in the same flex row.
- Sort changes the left-to-right order of apartment COLUMNS. Metric rows, hidden-id filter, and best-value highlighting are untouched.

## Sort logic & extractors

Extend `src/lib/apartment-sort.ts`:

- **`SortField` gains 4 members:** `"numBathrooms" | "numBalconies" | "distanceBikeMin" | "distanceTransitMin"` — total union: 10 members.
- **`SortableApartment` gains 4 fields**, all `number | null`, matching `ApartmentWithRatings` in `src/app/compare/page.tsx`.
- **`EXTRACTORS` gains 4 entries**, each a plain field read.
- **Two label maps:**
  - `SORT_FIELD_LABELS` (unchanged) — the 6-entry map used by the apartments-list page.
  - `COMPARE_SORT_FIELD_LABELS` (new) — 10 entries. Reuses the 6 existing labels verbatim and adds Bathrooms, Balconies, Bike to SBB, Transit to SBB.
- **`compareApartments` itself does not change** — it dispatches by `field` through `EXTRACTORS`, so adding entries to the map is enough. Null-last, tie-break on `createdAt` desc → `id` asc, direction flip, `localeCompare` for strings — all reused.
- **`SORT_FIELD_IDS`** (currently `Object.keys(SORT_FIELD_LABELS)`) is redefined as `Object.keys(COMPARE_SORT_FIELD_LABELS)` so `isSortField` validates the superset. The list page's `<Select>` continues to render from the narrower `SORT_FIELD_LABELS` map, so users can never select one of the new fields on the list page through the UI.

## State & persistence

Mirrors the apartments-list sort pattern, with its own keys and event so the two views stay independent.

### localStorage keys

- `flatpare-compare-sort-field` — one of the 10 `SortField` values.
- `flatpare-compare-sort-direction` — `"asc" | "desc"`.

### Custom event

- `flatpare-compare-sort-change` — separate from `flatpare-apartments-sort-change`, so toggling one view's sort doesn't wake up the other.

### Defaults

- Field: `rentChf`.
- Direction: `asc`.

Rationale: a comparison view is usually opened to find "the best option by some metric". Cheapest-first is the most common starting mental model. Differs from the list page's `createdAt desc` (which is "what did I upload most recently"). Invalid localStorage values fall back to these defaults via `isSortField` / `isSortDirection`.

### Hook usage in the compare page

```tsx
const [sortField, setSortField] = usePersistedEnum<SortField>(
  COMPARE_SORT_FIELD_STORAGE_KEY,
  COMPARE_SORT_CHANGE_EVENT,
  "rentChf",
  isSortField
);
const [sortDirection, setSortDirection] = usePersistedEnum<SortDirection>(
  COMPARE_SORT_DIRECTION_STORAGE_KEY,
  COMPARE_SORT_CHANGE_EVENT,
  "asc",
  isSortDirection
);
```

### Applying the sort

Wrap the existing `visible` array (already filtered by `hiddenIds`) in a `useMemo` that sorts via `compareApartments(a, b, sortField, sortDirection)`. Iterate the memoised result in the table's column rendering instead of `visible` directly. The hidden-ids filter runs first; sort runs after — so hiding a column doesn't change the sort result, only removes the hidden column from it.

### No impact on the detail-page pager

`useApartmentPager` reads the list-page keys (`flatpare-apartments-sort-field` / `-direction`). The new compare keys are disjoint; the hook stays untouched.

## Testing

### Unit tests — 4 new cases in `src/lib/__tests__/apartment-sort.test.ts`

1. Sorts by `numBathrooms` ascending.
2. Sorts by `numBalconies` descending.
3. Null `distanceBikeMin` sorts last regardless of direction.
4. Tie-break on `distanceTransitMin` falls back to `createdAt` desc.

The existing tests already prove the null-last / tie-break / direction machinery; these new tests only confirm the new extractors route through it correctly.

### Integration tests — new `src/app/compare/__tests__/compare-page.test.tsx`

Fixture: 3 apartments with distinct `createdAt`, one with `rentChf: null`, and populated values for the 4 new fields.

1. Default sort on first load: `rentChf` asc, null-rent apartment last.
2. Reads sort from localStorage on mount.
3. Changing the Select re-orders columns and writes `flatpare-compare-sort-field`.
4. Direction toggle flips columns and writes `flatpare-compare-sort-direction`.
5. Invalid localStorage values fall back to defaults.
6. Hidden-ids filter composes with sort — hide a column, then change sort, remaining columns honor the new sort.

### Test infrastructure

The compare page fetches `/api/apartments` for the list then fetches each `/api/apartments/{id}` sequentially. The mock uses a URL-dispatching `fetch` spy (same pattern as `pager.test.tsx`) that returns the list for `/api/apartments` and matching detail records for `/api/apartments/{id}`.

### No changes to existing test files

The existing apartments-list and pager tests continue to pass. The only ambient change — `SORT_FIELD_IDS` now derived from the superset `COMPARE_SORT_FIELD_LABELS` — only affects what `isSortField` accepts, and neither the list page UI nor its tests write the new field values to localStorage.

## Out of scope

- No clickable column-header sorting (rejected: mixes the metric-label column with interaction).
- No multi-key user-facing sort.
- No URL query-string sync.
- No server-side or per-user DB-backed preferences.
- No sort control on the compare view's rating rows (sort is metric-based only, per the issue's framing).
