# Apartment list search — design

**Issue:** [#65 — Search bar for apartments in the Apartments view (name / code / address)](https://github.com/brlauuu/flatpare/issues/65)
**Date:** 2026-04-24

## Problem

The apartments list at `/apartments` renders every apartment the user has uploaded. As the collection grows, finding a specific apartment by scanning cards is friction. The user wants a search input that filters the visible apartments by name, short code, or address.

## Scope

One in-page search input on `/apartments`. Substring, case-insensitive. Filters the existing client-side list (no API changes). Composes with the sort feature from #61 (filter first, then sort). Resets on every page load — no persistence. One source file changes (`src/app/apartments/page.tsx`) plus the existing page tests.

## UI

New row added ABOVE the existing header row:

```
[🔍 Search apartments...                 X ]           ← new row, full-width with max-w-sm
Apartments                 [Sort ▾] [↑/↓] [Grid/List] [Upload New]
[card grid / list]
```

### Search input

- shadcn `<Input>` (already in the repo at `src/components/ui/input.tsx`).
- `type="text"`, `placeholder="Search by name, code, or address..."`, `aria-label="Search apartments"`.
- Wrapped in a relative-positioned container so a `<Search>` lucide icon can sit absolutely inside the left padding and a clear-`X` button on the right.
- Left padding `pl-9` to clear the icon; right padding `pr-9` to clear the clear button.
- Container `w-full max-w-sm` — a ~384px max width, full-width on narrow screens, compact on desktop.
- `h-9` — matches the Upload New button to keep vertical rhythm when rows stack.
- No auto-focus on mount. Users tap/click in themselves; auto-focus would hijack screen readers and mobile keyboards.

### Clear (X) button inside the input

- Visible only when the input has at least one character (trimmed).
- shadcn `<Button variant="ghost" size="sm">` with an `X` icon from lucide, sized `h-7 w-7 p-0`, positioned absolute to the right inside the input.
- `aria-label="Clear search"`.
- Clicking sets the query back to `""`.

### Empty-result state

When the trimmed query is non-empty AND filtering yields zero apartments, replace the card grid/list with a centered empty state:

```
[search icon]
No apartments match "xyz"
[Show all apartments]
```

- Same component pattern as the existing "No apartments yet" empty state (Building2 icon in a muted circle, headline text, CTA button below).
- `<Button variant="outline">Show all apartments</Button>` resets the query. The visible label intentionally differs from the inline `X` button's `aria-label="Clear search"` so tests and screen readers can distinguish the two when both are visible.
- The search input at the top of the page STAYS visible so the user can refine the query in place.

The existing "No apartments yet" empty state (when `apartments.length === 0` because nothing has been uploaded) is unchanged — it only renders when there's no data at all.

## Filter logic

- **State:** one `useState<string>("")` local to `ApartmentsPage`. No custom hook.
- **Normalization:** `query.trim().toLowerCase()`. If the result is empty, the filter is a no-op.
- **Matched fields:** `name`, `shortCode`, `address`. Null → empty string (never matches).
- **Match rule:** `.includes(normalizedQuery)` on the lowercased value of each of the three fields. An apartment matches if ANY of the three includes the query.
- **No regex, no fuzzy matching.** Substring is enough for this dataset size and matches user expectations.

## Composition with sort

The existing page flow is: `apartments` → sort via `compareApartments` → `sortedApartments` → render. With search added:

```
apartments → filter by query → filteredApartments → sort → sortedApartments → render
```

Split into two `useMemo`s so each step has its own dependencies:

```tsx
const filteredApartments = useMemo(() => {
  const q = query.trim().toLowerCase();
  if (q === "") return apartments;
  return apartments.filter((apt) => {
    const name = apt.name?.toLowerCase() ?? "";
    const code = apt.shortCode?.toLowerCase() ?? "";
    const addr = apt.address?.toLowerCase() ?? "";
    return name.includes(q) || code.includes(q) || addr.includes(q);
  });
}, [apartments, query]);

const sortedApartments = useMemo(() => {
  return [...filteredApartments].sort((a, b) =>
    compareApartments(a, b, sortField, sortDirection)
  );
}, [filteredApartments, sortField, sortDirection]);
```

### Empty-query fast path

When the query is empty, `filteredApartments` returns the same reference as `apartments` (no allocation, no `.filter` call). The sort memo then sorts the original array as today.

### Empty-result vs empty-data

Two different zero-item states distinguished by the query:

- `apartments.length === 0` → "No apartments yet" (existing, unchanged).
- `apartments.length > 0 && query !== "" && filteredApartments.length === 0` → "No apartments match".
- `apartments.length > 0 && query === ""` → normal grid/list rendering.

## State & persistence

None. The query is local component state. A page reload or navigating away and back resets it to empty. No localStorage, no URL query parameter, no cookie. (Shareable-search URLs are explicitly out of scope — if the user later wants to deep-link to a filtered view, that's a separate feature.)

## Testing

Extend `src/app/apartments/__tests__/apartments-page.test.tsx` with a new `describe("Apartments page — search", ...)` block. The existing 9 tests are preserved.

### Fixture update

Update the `APARTMENTS` constant to give two of three apartments non-null addresses (needed for address-search and null-address tests):

- Sonnenweg 3 → `address: "Sonnenweg 3, 8001 Zürich"`
- Bergstrasse 12 → `address: "Bergstrasse 12, 8032 Zürich"`
- Seeblick 7 → `address: null` (unchanged)

Run the existing sort/view tests after the fixture update to confirm they still pass. They should — none of them assert on address text.

### New tests (10)

1. Search input renders empty on mount; all 3 apartments visible.
2. Filters by name substring, case-insensitive (`"berg"` → Bergstrasse only).
3. Filters by short code case-insensitively (`"GHI"` → Seeblick only; user types uppercase, matches lowercased stored value).
4. Filters by address (`"zürich"` → Sonnenweg + Bergstrasse).
5. Null address never matches (`"null"` → zero matches, empty state renders).
6. Empty-result state renders when the query has no matches: `"No apartments match "xyz""`.
7. "Show all apartments" button in the empty-result state resets the query and restores all 3 apartments.
8. Inline clear (X) button in the input resets the query and restores all 3 apartments.
9. Whitespace-only query (`"  "`) behaves as empty — all 3 apartments render.
10. Search composes with sort: seed `sort-field=rentChf, direction=asc`, type `"berg"`; Bergstrasse renders (and the sort memo still runs without erroring).

### Existing tests

All 9 existing tests pass unchanged. The grid-vs-list toggle, sort dropdown, direction toggle, and "6-option Select" regression tests are independent of search.

## Out of scope

- No URL query-string sync.
- No localStorage persistence.
- No fuzzy matching (diacritics-insensitive, typo-tolerant).
- No highlighting matched substrings in the card.
- No "X of Y apartments" result counter.
- No filtering the compare view — that's a separate concern and not in this issue.
- No debounce — the dataset is small and in-memory, direct `onChange` is fine.
