# Apartment Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side sort controls to the apartments list page (`/apartments`) with six fields, asc/desc toggle, and localStorage persistence. Refactor the existing view-toggle state into a reusable `usePersistedEnum` hook.

**Architecture:** Pure comparator in `src/lib/apartment-sort.ts` handles the sort logic and is unit-tested in isolation. A new `usePersistedEnum` hook in `src/lib/use-persisted-enum.ts` replaces the three ad-hoc `useSyncExternalStore` wrappers the page would otherwise grow; the existing view toggle is refactored to use it so the primitive earns its keep. Sort state is applied via `useMemo` over the already-fetched apartments array — no API changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + React Testing Library, shadcn/ui (base-nova style on `@base-ui/react`), Tailwind, `lucide-react` icons.

**Spec:** [`docs/superpowers/specs/2026-04-24-apartment-sort-design.md`](../specs/2026-04-24-apartment-sort-design.md)
**Issue:** [#61](https://github.com/brlauuu/flatpare/issues/61)

---

## File Structure

### Files created

- `src/lib/apartment-sort.ts` — `SORT_FIELDS` map, `SortField` / `SortDirection` types, pure `compareApartments(a, b, field, direction)` comparator.
- `src/lib/use-persisted-enum.ts` — generic `usePersistedEnum<T>(key, event, defaultValue, isValid)` hook.
- `src/lib/__tests__/apartment-sort.test.ts` — unit tests for the comparator.

### Files modified

- `src/app/apartments/page.tsx` — uses `usePersistedEnum` for view, sort field, sort direction; applies `useMemo` sort; renders new sort controls.

### Files renamed

- `src/app/apartments/__tests__/view-toggle.test.tsx` → `src/app/apartments/__tests__/apartments-page.test.tsx` — extended with new sort test cases.

### Files installed (by shadcn CLI)

- `src/components/ui/select.tsx` — shadcn Select component (not yet in the repo).

---

## Task 1: Install shadcn Select component

**Files:**
- Install: `src/components/ui/select.tsx` (via shadcn CLI)

- [ ] **Step 1: Verify the component is not already present**

Run: `ls src/components/ui/select.tsx 2>/dev/null && echo present || echo absent`
Expected: `absent`

- [ ] **Step 2: Install the Select component**

Run: `npx shadcn@latest add select`
Expected: creates `src/components/ui/select.tsx`. If CLI prompts, accept defaults. The component uses the project's `base-nova` style on top of `@base-ui/react`.

- [ ] **Step 3: Verify installation**

Run: `ls src/components/ui/select.tsx && head -5 src/components/ui/select.tsx`
Expected: file exists and imports from `@base-ui/react`.

- [ ] **Step 4: Verify the app still builds/lints**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/select.tsx package.json package-lock.json 2>/dev/null
git commit -m "chore: add shadcn select component"
```

If shadcn added any other supporting files, include them in `git add`. Do not include unrelated changes.

---

## Task 2: Extract `usePersistedEnum` hook and migrate view toggle

The existing view toggle in `src/app/apartments/page.tsx` uses a bespoke `useSyncExternalStore` + localStorage + custom-event pattern (see `subscribeView` / `getViewSnapshot` / `changeView`). Extract that pattern into a generic hook and use it for the view toggle. Sort state will plug into the same hook in later tasks.

This task is refactor-only: zero behavior change. The existing view-toggle tests are the safety net.

**Files:**
- Create: `src/lib/use-persisted-enum.ts`
- Modify: `src/app/apartments/page.tsx` (lines 44–66 and 104–107 — the view-toggle plumbing)
- Rename: `src/app/apartments/__tests__/view-toggle.test.tsx` → `src/app/apartments/__tests__/apartments-page.test.tsx`

- [ ] **Step 1: Rename the existing test file**

Run:
```bash
git mv src/app/apartments/__tests__/view-toggle.test.tsx \
       src/app/apartments/__tests__/apartments-page.test.tsx
```

Update the top `describe` block in the renamed file from `describe("Apartments view toggle", ...)` to `describe("Apartments page — view toggle", ...)` so later sort tests sit next to it.

- [ ] **Step 2: Run the renamed tests and confirm they pass against the current page**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: all existing view-toggle tests pass (unchanged behavior, only the file name changed).

- [ ] **Step 3: Create `usePersistedEnum` hook**

Create `src/lib/use-persisted-enum.ts`:

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

export function usePersistedEnum<T extends string>(
  storageKey: string,
  eventName: string,
  defaultValue: T,
  isValid: (value: string) => value is T
): [T, (next: T) => void] {
  const subscribe = useCallback(
    (callback: () => void) => {
      // localStorage's 'storage' event only fires in *other* tabs, so we also
      // dispatch a custom event on same-tab writes.
      window.addEventListener("storage", callback);
      window.addEventListener(eventName, callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(eventName, callback);
      };
    },
    [eventName]
  );

  const getSnapshot = useCallback((): T => {
    const raw = window.localStorage.getItem(storageKey);
    return raw !== null && isValid(raw) ? raw : defaultValue;
  }, [storageKey, defaultValue, isValid]);

  const getServerSnapshot = useCallback((): T => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      window.localStorage.setItem(storageKey, next);
      window.dispatchEvent(new Event(eventName));
    },
    [storageKey, eventName]
  );

  return [value, setValue];
}
```

- [ ] **Step 4: Refactor the view toggle in `src/app/apartments/page.tsx` to use the hook**

Delete the local helpers `subscribeView`, `getViewSnapshot`, `getViewServerSnapshot`, and `changeView`. Delete the `VIEW_STORAGE_KEY` and `VIEW_CHANGE_EVENT` constants if they live only in the page — otherwise keep them as top-level constants used with the hook.

Replace the `useSyncExternalStore(...)` call with:

```tsx
import { usePersistedEnum } from "@/lib/use-persisted-enum";

type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "flatpare-apartments-view";
const VIEW_CHANGE_EVENT = "flatpare-apartments-view-change";

function isViewMode(v: string): v is ViewMode {
  return v === "grid" || v === "list";
}

// inside ApartmentsPage():
const [view, setView] = usePersistedEnum<ViewMode>(
  VIEW_STORAGE_KEY,
  VIEW_CHANGE_EVENT,
  "grid",
  isViewMode
);
```

Replace the two `onClick={() => changeView("grid")}` / `changeView("list")` handlers with `setView("grid")` / `setView("list")`.

- [ ] **Step 5: Run the view-toggle tests to confirm no behavior change**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: all existing tests pass unchanged (same localStorage key, same event name, same UI contract).

- [ ] **Step 6: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/use-persisted-enum.ts \
        src/app/apartments/page.tsx \
        src/app/apartments/__tests__/apartments-page.test.tsx
git rm src/app/apartments/__tests__/view-toggle.test.tsx 2>/dev/null || true
git commit -m "refactor: extract usePersistedEnum hook for view toggle"
```

(`git mv` in Step 1 already stages the rename, so `git rm` on the old path is a no-op safety net.)

---

## Task 3: Write the pure sort comparator with unit tests (TDD)

The comparator is pure and handles the tricky edge cases (nulls, tie-breaks, numeric string compare). Isolate it so the tests are cheap and exhaustive, and the page-level integration tests in Task 5 can trust the comparator and only verify wiring.

**Files:**
- Create: `src/lib/apartment-sort.ts`
- Test: `src/lib/__tests__/apartment-sort.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/apartment-sort.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  compareApartments,
  type SortableApartment,
} from "@/lib/apartment-sort";

function apt(overrides: Partial<SortableApartment>): SortableApartment {
  return {
    id: 0,
    rentChf: null,
    sizeM2: null,
    numRooms: null,
    avgOverall: null,
    shortCode: null,
    createdAt: null,
    ...overrides,
  };
}

describe("compareApartments", () => {
  it("sorts numeric fields ascending", () => {
    const a = apt({ id: 1, rentChf: 2000 });
    const b = apt({ id: 2, rentChf: 1500 });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeGreaterThan(0);
    expect(compareApartments(b, a, "rentChf", "asc")).toBeLessThan(0);
  });

  it("sorts numeric fields descending", () => {
    const a = apt({ id: 1, rentChf: 2000 });
    const b = apt({ id: 2, rentChf: 1500 });
    expect(compareApartments(a, b, "rentChf", "desc")).toBeLessThan(0);
  });

  it("parses avgOverall from string before comparing", () => {
    const a = apt({ id: 1, avgOverall: "4.5" });
    const b = apt({ id: 2, avgOverall: "3.2" });
    expect(compareApartments(a, b, "avgOverall", "asc")).toBeGreaterThan(0);
  });

  it("parses createdAt from ISO string and compares chronologically", () => {
    const older = apt({ id: 1, createdAt: "2026-01-01T00:00:00Z" });
    const newer = apt({ id: 2, createdAt: "2026-04-01T00:00:00Z" });
    expect(compareApartments(older, newer, "createdAt", "desc")).toBeGreaterThan(0);
    expect(compareApartments(older, newer, "createdAt", "asc")).toBeLessThan(0);
  });

  it("sorts shortCode with natural numeric order", () => {
    const a = apt({ id: 1, shortCode: "F-10" });
    const b = apt({ id: 2, shortCode: "F-2" });
    // Natural order: F-2 < F-10. Ascending puts b before a.
    expect(compareApartments(a, b, "shortCode", "asc")).toBeGreaterThan(0);
  });

  it("puts nulls after non-null values in ascending order", () => {
    const withPrice = apt({ id: 1, rentChf: 1000 });
    const nullPrice = apt({ id: 2, rentChf: null });
    expect(compareApartments(withPrice, nullPrice, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(nullPrice, withPrice, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("puts nulls after non-null values in descending order too", () => {
    const withPrice = apt({ id: 1, rentChf: 1000 });
    const nullPrice = apt({ id: 2, rentChf: null });
    expect(compareApartments(withPrice, nullPrice, "rentChf", "desc")).toBeLessThan(0);
    expect(compareApartments(nullPrice, withPrice, "rentChf", "desc")).toBeGreaterThan(0);
  });

  it("tie-breaks equal primary field by createdAt desc", () => {
    const earlier = apt({
      id: 1,
      rentChf: 2000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const later = apt({
      id: 2,
      rentChf: 2000,
      createdAt: "2026-04-01T00:00:00Z",
    });
    // Same rentChf → tie-break on createdAt desc → later comes first.
    expect(compareApartments(earlier, later, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("tie-breaks equal primary and equal createdAt by id ascending", () => {
    const a = apt({
      id: 5,
      rentChf: 2000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const b = apt({
      id: 9,
      rentChf: 2000,
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeLessThan(0);
  });

  it("tie-breaks two null primaries by createdAt desc then id asc", () => {
    const a = apt({
      id: 5,
      rentChf: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const b = apt({
      id: 9,
      rentChf: null,
      createdAt: "2026-04-01T00:00:00Z",
    });
    // Both null → tie-break → b (newer createdAt) before a.
    expect(compareApartments(a, b, "rentChf", "asc")).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/lib/__tests__/apartment-sort.test.ts`
Expected: all tests fail with `Cannot find module '@/lib/apartment-sort'`.

- [ ] **Step 3: Implement the comparator**

Create `src/lib/apartment-sort.ts`:

```ts
export type SortField =
  | "createdAt"
  | "rentChf"
  | "sizeM2"
  | "numRooms"
  | "avgOverall"
  | "shortCode";

export type SortDirection = "asc" | "desc";

export interface SortableApartment {
  id: number;
  rentChf: number | null;
  sizeM2: number | null;
  numRooms: number | null;
  avgOverall: string | null;
  shortCode: string | null;
  createdAt: string | null;
}

type Extractor = (apt: SortableApartment) => number | string | null;

const EXTRACTORS: Record<SortField, Extractor> = {
  rentChf: (a) => a.rentChf,
  sizeM2: (a) => a.sizeM2,
  numRooms: (a) => a.numRooms,
  avgOverall: (a) => (a.avgOverall === null ? null : parseFloat(a.avgOverall)),
  createdAt: (a) => (a.createdAt === null ? null : Date.parse(a.createdAt)),
  shortCode: (a) => a.shortCode,
};

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  createdAt: "Date added",
  rentChf: "Price",
  sizeM2: "Size",
  numRooms: "Rooms",
  avgOverall: "Avg rating",
  shortCode: "Short code",
};

function compareValues(
  va: number | string | null,
  vb: number | string | null
): number {
  // Nulls always sort last, regardless of direction — caller applies direction
  // only to the primary comparison result (not to null handling).
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (typeof va === "string" && typeof vb === "string") {
    return va.localeCompare(vb, undefined, { numeric: true });
  }
  if (typeof va === "number" && typeof vb === "number") {
    return va - vb;
  }
  // Mixed types shouldn't happen for a given field; fall back to 0.
  return 0;
}

export function compareApartments(
  a: SortableApartment,
  b: SortableApartment,
  field: SortField,
  direction: SortDirection
): number {
  const extract = EXTRACTORS[field];
  const primary = compareValues(extract(a), extract(b));
  if (primary !== 0) {
    // Direction only flips the primary comparison. If one side is null, the
    // non-null side already won above — that win is direction-independent.
    const aNull = extract(a) === null;
    const bNull = extract(b) === null;
    if (aNull || bNull) return primary;
    return direction === "asc" ? primary : -primary;
  }

  // Tie-break: createdAt desc (newer first), then id ascending.
  const aCreated = a.createdAt === null ? null : Date.parse(a.createdAt);
  const bCreated = b.createdAt === null ? null : Date.parse(b.createdAt);
  const createdCmp = compareValues(aCreated, bCreated);
  if (createdCmp !== 0) {
    // Desc by default — newer first.
    return -createdCmp;
  }
  return a.id - b.id;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- src/lib/__tests__/apartment-sort.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apartment-sort.ts src/lib/__tests__/apartment-sort.test.ts
git commit -m "feat: add apartment sort comparator"
```

---

## Task 4: Wire sort state into the apartments page (no UI yet)

Plug `usePersistedEnum` in for `sortField` and `sortDirection`, apply `compareApartments` via `useMemo`, and add integration tests that assert default sort order and localStorage persistence. UI controls come in Task 5; for now the sort is driven by localStorage so tests can prime it directly.

**Files:**
- Modify: `src/app/apartments/page.tsx`
- Modify: `src/app/apartments/__tests__/apartments-page.test.tsx`

- [ ] **Step 1: Update the test fixture to include `createdAt` and more rows**

In `src/app/apartments/__tests__/apartments-page.test.tsx`, replace the `APARTMENTS` constant with:

```ts
const APARTMENTS = [
  {
    id: 1,
    name: "Sonnenweg 3",
    address: null,
    sizeM2: 60,
    numRooms: 2.5,
    rentChf: 2200,
    shortCode: "ABC-2.5B-WY-4057",
    avgOverall: null,
    myRating: null,
    createdAt: "2026-01-15T10:00:00Z",
  },
  {
    id: 2,
    name: "Bergstrasse 12",
    address: null,
    sizeM2: 45,
    numRooms: 2,
    rentChf: 1800,
    shortCode: "DEF-2B-W-4058",
    avgOverall: "3.5",
    myRating: 4,
    createdAt: "2026-03-20T10:00:00Z",
  },
  {
    id: 3,
    name: "Seeblick 7",
    address: null,
    sizeM2: 80,
    numRooms: 3.5,
    rentChf: null,
    shortCode: "GHI-3.5B-WY-4059",
    avgOverall: "4.5",
    myRating: null,
    createdAt: "2026-02-10T10:00:00Z",
  },
];
```

Rerun the existing tests to confirm the fixture change didn't break them:

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: all existing view-toggle tests still pass.

- [ ] **Step 2: Write the failing default-sort test**

Append to `src/app/apartments/__tests__/apartments-page.test.tsx` (after the existing `describe` block):

```tsx
describe("Apartments page — sort", () => {
  function renderedShortCodes(): string[] {
    return Array.from(
      document.querySelectorAll('[data-slot="short-code"]')
    ).map((el) => el.textContent ?? "");
  }

  it("defaults to newest first (createdAt desc) when no preference is stored", async () => {
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // createdAt desc: Bergstrasse (2026-03-20), Seeblick (2026-02-10), Sonnenweg (2026-01-15)
    const order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  it("reads sort field and direction from localStorage on mount", async () => {
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");

    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // Ascending by rentChf: Bergstrasse (1800), Sonnenweg (2200), Seeblick (null last)
    const order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("falls back to defaults when localStorage has invalid values", async () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");

    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // Defaults: createdAt desc
    const order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  // Silence unused-warning for the helper; used by Task 5.
  void renderedShortCodes;
});
```

Note: the `renderedShortCodes` helper is referenced (via `void`) so TypeScript doesn't flag it as unused until Task 5 consumes it.

- [ ] **Step 3: Run tests to confirm the new ones fail**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: the three new tests fail (page is not yet sorting), existing view-toggle tests pass.

- [ ] **Step 4: Wire sort state and apply the comparator in `src/app/apartments/page.tsx`**

Add imports at the top:

```tsx
import { useMemo } from "react";
import {
  compareApartments,
  SORT_FIELD_LABELS,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
```

Add constants and validators near the existing `VIEW_*` constants:

```tsx
const SORT_FIELD_STORAGE_KEY = "flatpare-apartments-sort-field";
const SORT_DIRECTION_STORAGE_KEY = "flatpare-apartments-sort-direction";
const SORT_CHANGE_EVENT = "flatpare-apartments-sort-change";

const SORT_FIELD_IDS = Object.keys(SORT_FIELD_LABELS) as SortField[];

function isSortField(v: string): v is SortField {
  return (SORT_FIELD_IDS as string[]).includes(v);
}

function isSortDirection(v: string): v is SortDirection {
  return v === "asc" || v === "desc";
}
```

Inside `ApartmentsPage()`, after the existing `view` hook call, add:

```tsx
const [sortField, setSortField] = usePersistedEnum<SortField>(
  SORT_FIELD_STORAGE_KEY,
  SORT_CHANGE_EVENT,
  "createdAt",
  isSortField
);
const [sortDirection, setSortDirection] = usePersistedEnum<SortDirection>(
  SORT_DIRECTION_STORAGE_KEY,
  SORT_CHANGE_EVENT,
  "desc",
  isSortDirection
);

const sortedApartments = useMemo(() => {
  return [...apartments].sort((a, b) =>
    compareApartments(a, b, sortField, sortDirection)
  );
}, [apartments, sortField, sortDirection]);
```

Mark `setSortField` and `setSortDirection` as currently-unused with a `void` expression (Task 5 will wire them) so ESLint doesn't flag them:

```tsx
void setSortField;
void setSortDirection;
```

Replace both `.map` loops that iterate over `apartments` (inside the grid and list branches) with `sortedApartments.map(...)`. The early-return check `if (apartments.length === 0)` stays as-is.

- [ ] **Step 5: Run the sort tests — they should pass now**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: all tests pass (view-toggle + sort).

- [ ] **Step 6: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/apartments/page.tsx \
        src/app/apartments/__tests__/apartments-page.test.tsx
git commit -m "feat: apply sort to apartments list (localStorage-driven)"
```

---

## Task 5: Add sort UI controls (field select + direction toggle)

Add the two controls to the page header and wire them to `setSortField` / `setSortDirection`. The localStorage-driven tests from Task 4 already prove the sort works end-to-end; these tests prove the UI correctly drives it.

**Files:**
- Modify: `src/app/apartments/page.tsx`
- Modify: `src/app/apartments/__tests__/apartments-page.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add these tests inside the `describe("Apartments page — sort", ...)` block in `src/app/apartments/__tests__/apartments-page.test.tsx`:

```tsx
it("changing the sort field re-orders the list and persists to localStorage", async () => {
  const user = userEvent.setup();
  render(<ApartmentsPage />);
  await waitFor(() => {
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
  });

  // Open the field selector and pick "Price".
  await user.click(screen.getByRole("combobox", { name: /Sort by/i }));
  await user.click(screen.getByRole("option", { name: "Price" }));

  // Default direction is desc → highest price first: Sonnenweg (2200),
  // Bergstrasse (1800), Seeblick (null last).
  await waitFor(() => {
    const order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);
  });

  expect(localStorage.getItem("flatpare-apartments-sort-field")).toBe("rentChf");
});

it("clicking the direction toggle flips the order and persists", async () => {
  const user = userEvent.setup();
  // Start with rentChf desc so the toggle has something to flip.
  localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
  localStorage.setItem("flatpare-apartments-sort-direction", "desc");

  render(<ApartmentsPage />);
  await waitFor(() => {
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
  });

  // desc: Sonnenweg (2200), Bergstrasse (1800), Seeblick (null)
  let order = Array.from(document.querySelectorAll("h3")).map(
    (el) => el.textContent
  );
  expect(order).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);

  await user.click(screen.getByRole("button", { name: /Descending/i }));

  // asc: Bergstrasse (1800), Sonnenweg (2200), Seeblick (null last)
  await waitFor(() => {
    order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  expect(localStorage.getItem("flatpare-apartments-sort-direction")).toBe("asc");
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: the two new UI tests fail — the combobox and direction button don't exist yet.

- [ ] **Step 3: Add the UI in `src/app/apartments/page.tsx`**

Add imports:

```tsx
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

Remove the `void setSortField;` and `void setSortDirection;` lines added in Task 4.

In the header row — immediately inside the `<div className="flex items-center gap-2">` and **before** the existing view-toggle `<div role="group">` — add:

```tsx
<Select
  value={sortField}
  onValueChange={(value) => setSortField(value as SortField)}
>
  <SelectTrigger aria-label="Sort by" className="h-9 w-[160px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {SORT_FIELD_IDS.map((id) => (
      <SelectItem key={id} value={id}>
        {SORT_FIELD_LABELS[id]}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
<Button
  type="button"
  variant="outline"
  size="sm"
  aria-label={sortDirection === "asc" ? "Ascending" : "Descending"}
  aria-pressed={sortDirection === "asc"}
  onClick={() =>
    setSortDirection(sortDirection === "asc" ? "desc" : "asc")
  }
  className="h-9 w-9 p-0"
>
  {sortDirection === "asc" ? (
    <ArrowUp className="h-4 w-4" />
  ) : (
    <ArrowDown className="h-4 w-4" />
  )}
</Button>
```

- [ ] **Step 4: Run the UI tests to confirm they pass**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Manually smoke-test in the browser**

Run: `npm run dev`
Open: `http://localhost:3002/apartments`

Verify:
1. Sort dropdown shows "Date added" by default, direction button shows `ArrowDown`.
2. Changing the dropdown re-orders the visible cards (and list rows if you switch view).
3. Clicking the direction button flips the order and swaps the icon.
4. Reloading the page keeps your selection.
5. Switching between Grid and List preserves sort order.

Stop the dev server.

- [ ] **Step 6: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, no lint errors.

- [ ] **Step 7: Run the build as a final check**

Run: `npm run build`
Expected: build succeeds (no type errors, no runtime errors during page prerender).

- [ ] **Step 8: Commit**

```bash
git add src/app/apartments/page.tsx \
        src/app/apartments/__tests__/apartments-page.test.tsx
git commit -m "feat: add sort controls to apartments page (#61)"
```

---

## Task 6: Open PR and wrap up

**Files:** none — workflow tasks only.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 61-apartment-sort`
Expected: branch published to origin.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: sort options on apartments list (#61)" \
  --body "$(cat <<'EOF'
## Summary
- Six sortable fields on `/apartments`: date added, price, size, rooms, avg rating, short code
- Asc/desc toggle, persisted to localStorage alongside the view toggle
- Pure comparator in `src/lib/apartment-sort.ts` with unit tests; integration tests cover wiring and persistence
- Refactored view-toggle plumbing into a reusable `usePersistedEnum` hook

## Test plan
- [ ] `npm test` passes
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds
- [ ] Manually verified in browser: dropdown, direction toggle, persistence across reloads, grid/list both honor sort

Closes #61

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Check CI**

Run: `gh pr checks --watch`
Expected: all checks pass.

- [ ] **Step 4: Hand off to review** — stop here and return to the issue-to-pr workflow's Phase 7.

---

## Self-Review Checklist

**Spec coverage:**
- Six sort fields — covered in `SORT_FIELD_LABELS` (Task 3) and `SelectItem`s (Task 5). ✓
- Asc/desc toggle — covered in Task 5 UI and Task 3/4 comparator behavior. ✓
- LocalStorage keys (`sort-field`, `sort-direction`) and default (`createdAt` desc) — covered in Task 4. ✓
- Custom event `flatpare-apartments-sort-change` — covered in Task 4 constants; both `usePersistedEnum` callers dispatch it. ✓
- Null-last — covered by tests in Task 3 (asc and desc). ✓
- Tie-break `createdAt desc` then `id asc` — covered by tests in Task 3. ✓
- Short code `localeCompare` with numeric option — covered by test in Task 3. ✓
- `usePersistedEnum` extraction with view-toggle migration — Task 2. ✓
- SSR snapshot returns defaults — Task 2 Step 3 (`getServerSnapshot`). ✓
- Existing view-toggle tests preserved — Task 2 Step 5. ✓
- Renamed test file — Task 2 Step 1. ✓
- UI position (left of view toggle) — Task 5 Step 3. ✓

**Placeholder scan:** No TBDs, TODOs, or "implement later" — every code step has complete code. No "add error handling" without specifics.

**Type consistency:**
- `SortField` / `SortDirection` / `SortableApartment` defined in Task 3, imported in Task 4.
- `SORT_FIELD_LABELS` defined in Task 3, used in Task 4 (IDs) and Task 5 (labels).
- `usePersistedEnum<T>` signature in Task 2 matches the three callers (view, sortField, sortDirection).
- `compareApartments(a, b, field, direction)` signature in Task 3 matches the call in Task 4.

No gaps found.
