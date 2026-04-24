# Apartment sort controls — design

**Issue:** [#61 — I want some sorting options for the apartments in the apartment view](https://github.com/brlauuu/flatpare/issues/61)
**Date:** 2026-04-24

## Problem

The apartments list at `/apartments` currently renders in whatever order the API returns. The user wants to re-order the list by common attributes so they can compare listings more easily.

## Scope

Six sortable fields, each toggleable ascending/descending, with the selection persisted across page loads. Sorting is client-side over the already-fetched list. No backend changes.

## UI

Two new controls to the left of the existing view-toggle group in the apartments page header. Order left → right:

`[Sort field ▾] [↑/↓] [Grid/List] [Upload New]`

- **Field selector:** shadcn `<Select>` with six items:
  - Date added
  - Price
  - Size
  - Rooms
  - Avg rating
  - Short code
- **Direction toggle:** ghost `<Button>` sized to match the view-toggle squares, showing `ArrowUp` / `ArrowDown` from `lucide-react`. `aria-label` switches between `"Ascending"` and `"Descending"`; `aria-pressed` reflects state. Click flips direction.
- The header row already uses `flex items-center gap-2` and wraps on narrow screens, so no additional responsive work is required.
- If `@/components/ui/select` is not yet present in the project, install via `npx shadcn@latest add select` during implementation.

## Sort logic

A single `SORT_FIELDS` record keyed by field id, each entry `{ label, getValue(apt) }`. `getValue` returns `number | string | null` and is direction-agnostic.

The comparator:

1. Extract `va = getValue(a)`, `vb = getValue(b)`.
2. **Null handling.** If one is `null` and the other is not, the non-null wins regardless of direction (nulls always sort to the end).
3. **Numeric fields** (`rentChf`, `sizeM2`, `numRooms`, `avgOverall`, `createdAt` as timestamp): plain numeric compare. `avgOverall` is stored as `string | null` and is parsed via `parseFloat` inside `getValue`.
4. **String fields** (`shortCode`): `localeCompare(vb, undefined, { numeric: true })` so `F-2` sorts before `F-10`.
5. **Direction.** Applied by negating the comparator result when direction is `desc`.
6. **Tie-breaker.** When the active comparator returns `0` (ties or both null), fall back to `createdAt` descending, then to `id` ascending if `createdAt` also ties or is null. This keeps the order stable even when sorting by `createdAt` itself.

Applied via `useMemo` over the existing `apartments` state so it only recomputes when the list, field, or direction change.

### Field → value map

| Field id      | `getValue`                                       | Type       |
|---------------|--------------------------------------------------|------------|
| `createdAt`   | `apt.createdAt ? Date.parse(apt.createdAt) : null` | `number \| null` |
| `rentChf`     | `apt.rentChf`                                    | `number \| null` |
| `sizeM2`      | `apt.sizeM2`                                     | `number \| null` |
| `numRooms`    | `apt.numRooms`                                   | `number \| null` |
| `avgOverall`  | `apt.avgOverall ? parseFloat(apt.avgOverall) : null` | `number \| null` |
| `shortCode`   | `apt.shortCode`                                  | `string \| null` |

## State & persistence

Follows the existing view-toggle pattern (`useSyncExternalStore` + localStorage + same-tab custom event).

### localStorage keys

| Key                                    | Values                                                                 | Default       |
|----------------------------------------|------------------------------------------------------------------------|---------------|
| `flatpare-apartments-sort-field`       | `createdAt \| rentChf \| sizeM2 \| numRooms \| avgOverall \| shortCode` | `createdAt`   |
| `flatpare-apartments-sort-direction`   | `asc \| desc`                                                           | `desc`        |

Invalid / unknown values fall back to the default.

### Same-tab sync

Setters dispatch a custom event so same-tab subscribers re-read. One new event name: `flatpare-apartments-sort-change`. (`flatpare-apartments-view-change` already exists.)

### SSR snapshot

Server snapshot returns the defaults above. Matches the `getViewServerSnapshot` pattern so the initial server render is deterministic.

### Refactor: `usePersistedEnum` hook

With three persisted enums (view, sort field, sort direction), the subscribe/snapshot boilerplate would triple. Extract a primitive:

```ts
// src/lib/use-persisted-enum.ts
export function usePersistedEnum<T extends string>(
  storageKey: string,
  eventName: string,
  defaultValue: T,
  isValid: (v: string) => v is T,
): [T, (next: T) => void];
```

Rewrites:

- `ApartmentsPage` uses it for `view`, `sortField`, `sortDirection`.
- The existing view toggle keeps its `flatpare-apartments-view` key and `flatpare-apartments-view-change` event — the external contract does not change, so existing behavior and tests are preserved.

No standalone hook tests — exercised through three call sites in the page tests, which is enough coverage for a ~40-line primitive.

## Testing

Existing `src/app/apartments/__tests__/view-toggle.test.tsx` is renamed to `apartments-page.test.tsx` and extended, since both features share the same page-level setup (mocked `fetch`, `localStorage` reset).

### New tests

1. Default sort on first load is newest-first (createdAt desc).
2. Changing the field selector re-orders the rendered cards.
3. Clicking the direction toggle flips the order.
4. Nulls sort to the end regardless of direction, with a mixed numeric / null fixture, tested both asc and desc.
5. Tie-break: two apartments with identical `rentChf` fall back to `createdAt` desc.
6. Short code uses natural alphanumeric order (`F-2` before `F-10`).
7. Selection persists across remount via localStorage.
8. Invalid localStorage value falls back to defaults.

### Preserved tests

All existing view-toggle tests remain unchanged in behavior — the `usePersistedEnum` refactor preserves the localStorage keys and event names.

## Out of scope

- No backend sort parameter.
- No multi-key user-facing sort (the internal `createdAt` tie-breaker is fixed).
- No URL query-string sync (persistence is localStorage only).
- No per-view (grid vs list) sort preferences — one shared sort.
