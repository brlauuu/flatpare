# Compare View Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sort dropdown + direction toggle to `/compare` that reorders apartment columns, driven by its own localStorage keys independent of the apartments-list sort.

**Architecture:** Extend `src/lib/apartment-sort.ts` with four new `SortField` members (`numBathrooms`, `numBalconies`, `distanceBikeMin`, `distanceTransitMin`) and their extractors, plus a `COMPARE_SORT_FIELD_LABELS` map for the 10-field compare UI and three new `COMPARE_*` localStorage / event constants. The compare page wires two `usePersistedEnum` calls and a `useMemo` sort over the `visible` (post-hidden-filter) array, then renders a Select + direction button in the header.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + React Testing Library, shadcn/ui (`Select`, `Button`), `lucide-react` icons.

**Spec:** [`docs/superpowers/specs/2026-04-24-compare-sort-design.md`](../specs/2026-04-24-compare-sort-design.md)
**Issue:** [#63](https://github.com/brlauuu/flatpare/issues/63)

---

## File Structure

### Files modified

- `src/lib/apartment-sort.ts` — adds 4 members to `SortField`, 4 fields to `SortableApartment`, 4 entries to `EXTRACTORS`, new `COMPARE_SORT_FIELD_LABELS`, new `COMPARE_SORT_FIELD_STORAGE_KEY` / `COMPARE_SORT_DIRECTION_STORAGE_KEY` / `COMPARE_SORT_CHANGE_EVENT` constants. `SORT_FIELD_IDS` is re-rooted at the superset so `isSortField` accepts all 10.
- `src/lib/__tests__/apartment-sort.test.ts` — adds 4 new tests for the new fields.
- `src/app/compare/page.tsx` — adds sort state (two `usePersistedEnum` calls), `useMemo` over `visible`, and renders Select + direction button in the header. Six `visible.map(...)` iteration sites swap to `sortedVisible.map(...)`.

### Files created

- `src/app/compare/__tests__/compare-page.test.tsx` — first test file for the compare page; 6 integration tests.

### Files unchanged

- `src/app/apartments/page.tsx` — the apartments-list sort continues to use `SORT_FIELD_LABELS` (6 entries), independent localStorage keys, and its own event. No functional change.
- `src/lib/use-apartment-pager.ts` — reads the list-page keys; disjoint from compare keys.
- `src/lib/use-persisted-enum.ts` — unchanged; already generic.

---

## Task 1: Extend `apartment-sort` for compare-view fields (TDD)

Add 4 new sort fields plus the compare-view constants. Write new tests first to confirm the extractors and comparator dispatch correctly through the existing machinery.

**Files:**
- Modify: `src/lib/apartment-sort.ts`
- Modify: `src/lib/__tests__/apartment-sort.test.ts`

- [ ] **Step 1: Add 4 failing tests**

In `src/lib/__tests__/apartment-sort.test.ts`, locate the `apt()` helper near the top. Update it to include the 4 new fields so tests can set them via `overrides`:

```ts
function apt(overrides: Partial<SortableApartment>): SortableApartment {
  return {
    id: 0,
    rentChf: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    distanceBikeMin: null,
    distanceTransitMin: null,
    avgOverall: null,
    shortCode: null,
    createdAt: null,
    ...overrides,
  };
}
```

Append these 4 tests to the end of the existing `describe("compareApartments", ...)` block:

```ts
  it("sorts by numBathrooms ascending", () => {
    const a = apt({ id: 1, numBathrooms: 2 });
    const b = apt({ id: 2, numBathrooms: 1 });
    expect(compareApartments(a, b, "numBathrooms", "asc")).toBeGreaterThan(0);
    expect(compareApartments(b, a, "numBathrooms", "asc")).toBeLessThan(0);
  });

  it("sorts by numBalconies descending", () => {
    const a = apt({ id: 1, numBalconies: 0 });
    const b = apt({ id: 2, numBalconies: 2 });
    expect(compareApartments(a, b, "numBalconies", "desc")).toBeGreaterThan(0);
    expect(compareApartments(b, a, "numBalconies", "desc")).toBeLessThan(0);
  });

  it("puts null distanceBikeMin after non-null regardless of direction", () => {
    const withBike = apt({ id: 1, distanceBikeMin: 10 });
    const nullBike = apt({ id: 2, distanceBikeMin: null });
    expect(
      compareApartments(withBike, nullBike, "distanceBikeMin", "asc")
    ).toBeLessThan(0);
    expect(
      compareApartments(withBike, nullBike, "distanceBikeMin", "desc")
    ).toBeLessThan(0);
  });

  it("tie-breaks on distanceTransitMin via createdAt desc", () => {
    const earlier = apt({
      id: 1,
      distanceTransitMin: 25,
      createdAt: "2026-01-01T00:00:00Z",
    });
    const later = apt({
      id: 2,
      distanceTransitMin: 25,
      createdAt: "2026-04-01T00:00:00Z",
    });
    // Same transit time → tie-break on createdAt desc → later comes first.
    expect(
      compareApartments(earlier, later, "distanceTransitMin", "asc")
    ).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/lib/__tests__/apartment-sort.test.ts`
Expected: 4 new tests fail (the `apt()` helper update alone causes 4 TS errors about unknown fields when compiled — they fail at the TS layer; also 4 new tests fail at runtime because `EXTRACTORS` doesn't include the new fields).

- [ ] **Step 3: Extend `src/lib/apartment-sort.ts`**

Update the file to make the following changes (shown as replacement diffs — the surrounding code stays as-is):

Replace the `SortField` type:

```ts
export type SortField =
  | "createdAt"
  | "rentChf"
  | "sizeM2"
  | "numRooms"
  | "numBathrooms"
  | "numBalconies"
  | "distanceBikeMin"
  | "distanceTransitMin"
  | "avgOverall"
  | "shortCode";
```

Replace the `SortableApartment` interface:

```ts
export interface SortableApartment {
  id: number;
  rentChf: number | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  distanceBikeMin: number | null;
  distanceTransitMin: number | null;
  avgOverall: string | null;
  shortCode: string | null;
  createdAt: string | null;
}
```

Replace the `EXTRACTORS` constant:

```ts
const EXTRACTORS: Record<SortField, Extractor> = {
  rentChf: (a) => a.rentChf,
  sizeM2: (a) => a.sizeM2,
  numRooms: (a) => a.numRooms,
  numBathrooms: (a) => a.numBathrooms,
  numBalconies: (a) => a.numBalconies,
  distanceBikeMin: (a) => a.distanceBikeMin,
  distanceTransitMin: (a) => a.distanceTransitMin,
  avgOverall: (a) => (a.avgOverall === null ? null : parseFloat(a.avgOverall)),
  createdAt: (a) => (a.createdAt === null ? null : Date.parse(a.createdAt)),
  shortCode: (a) => a.shortCode,
};
```

Leave `SORT_FIELD_LABELS` as it is (6 entries — that's the apartments-list-page subset and is unchanged).

After the existing `SORT_FIELD_LABELS` declaration, add a new `COMPARE_SORT_FIELD_LABELS` (10 entries):

```ts
export const COMPARE_SORT_FIELD_LABELS: Record<SortField, string> = {
  createdAt: "Date added",
  rentChf: "Price",
  sizeM2: "Size",
  numRooms: "Rooms",
  numBathrooms: "Bathrooms",
  numBalconies: "Balconies",
  distanceBikeMin: "Bike to SBB",
  distanceTransitMin: "Transit to SBB",
  avgOverall: "Avg rating",
  shortCode: "Short code",
};
```

Replace the `SORT_FIELD_IDS` line so `isSortField` accepts all 10 fields (the list page's own `<Select>` still only renders `SORT_FIELD_LABELS`, so users cannot pick the new fields from the list UI):

```ts
export const SORT_FIELD_IDS = Object.keys(
  COMPARE_SORT_FIELD_LABELS
) as SortField[];
```

Append three new constants at the bottom of the file (after the existing `SORT_*` block, before EOF):

```ts
export const COMPARE_SORT_FIELD_STORAGE_KEY = "flatpare-compare-sort-field";
export const COMPARE_SORT_DIRECTION_STORAGE_KEY =
  "flatpare-compare-sort-direction";
export const COMPARE_SORT_CHANGE_EVENT = "flatpare-compare-sort-change";
```

- [ ] **Step 4: Run the apartment-sort tests — should be green**

Run: `npm test -- src/lib/__tests__/apartment-sort.test.ts`
Expected: 15 tests pass (11 existing + 4 new).

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (apartments-list sort tests, use-apartment-pager tests, everything), lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apartment-sort.ts src/lib/__tests__/apartment-sort.test.ts
git commit -m "feat: extend apartment-sort with compare-view fields"
```

---

## Task 2: Wire sort into the compare page (TDD)

Add integration tests first, then the UI and state. The default sort is `rentChf` asc — so the new tests expect "cheapest first" column order when no preference is stored.

**Files:**
- Modify: `src/app/compare/page.tsx`
- Create: `src/app/compare/__tests__/compare-page.test.tsx`

- [ ] **Step 1: Create the failing integration tests**

Create `src/app/compare/__tests__/compare-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ComparePage from "../page";

const DETAILS = [
  {
    id: 1,
    name: "Sonnenweg 3",
    address: null,
    sizeM2: 60,
    numRooms: 2.5,
    numBathrooms: 1,
    numBalconies: 1,
    hasWashingMachine: null,
    rentChf: 2200,
    distanceBikeMin: 12,
    distanceTransitMin: 25,
    shortCode: "ABC-2.5B-WY-4057",
    createdAt: "2026-01-15T10:00:00Z",
    ratings: [],
  },
  {
    id: 2,
    name: "Bergstrasse 12",
    address: null,
    sizeM2: 45,
    numRooms: 2,
    numBathrooms: 1,
    numBalconies: 0,
    hasWashingMachine: null,
    rentChf: 1800,
    distanceBikeMin: 8,
    distanceTransitMin: 15,
    shortCode: "DEF-2B-W-4058",
    createdAt: "2026-03-20T10:00:00Z",
    ratings: [],
  },
  {
    id: 3,
    name: "Seeblick 7",
    address: null,
    sizeM2: 80,
    numRooms: 3.5,
    numBathrooms: 2,
    numBalconies: 2,
    hasWashingMachine: null,
    rentChf: null,
    distanceBikeMin: 18,
    distanceTransitMin: 30,
    shortCode: "GHI-3.5B-WY-4059",
    createdAt: "2026-02-10T10:00:00Z",
    ratings: [],
  },
];

function columnOrder(): string[] {
  // Apartment names render in table headers with font-semibold class.
  return Array.from(
    document.querySelectorAll("thead th .font-semibold")
  ).map((el) => el.textContent ?? "");
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/apartments") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(DETAILS.map((d) => ({ id: d.id }))),
      } as Response);
    }
    const match = url.match(/\/api\/apartments\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      const detail = DETAILS.find((d) => d.id === id);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(detail),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Compare page — sort", () => {
  it("defaults to rentChf ascending (cheapest first, null last)", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    // rentChf asc: Bergstrasse (1800), Sonnenweg (2200), Seeblick (null last).
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
  });

  it("reads sort field and direction from localStorage on mount", async () => {
    localStorage.setItem("flatpare-compare-sort-field", "distanceBikeMin");
    localStorage.setItem("flatpare-compare-sort-direction", "asc");
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    // Bike asc: Bergstrasse (8), Sonnenweg (12), Seeblick (18).
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
  });

  it("changing the sort field re-orders columns and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("combobox", { name: /Sort by/i }));
    await user.click(screen.getByRole("option", { name: "Bathrooms" }));
    // Bathrooms asc with default direction asc: tie among Sonnenweg (1) and
    // Bergstrasse (1), then Seeblick (2). Tie-break createdAt desc →
    // Bergstrasse (2026-03-20) before Sonnenweg (2026-01-15).
    await waitFor(() => {
      expect(columnOrder()).toEqual([
        "Bergstrasse 12",
        "Sonnenweg 3",
        "Seeblick 7",
      ]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-field")).toBe(
      "numBathrooms"
    );
  });

  it("direction toggle flips column order and persists", async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    // Default asc: Bergstrasse, Sonnenweg, Seeblick.
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
    await user.click(screen.getByRole("button", { name: /Ascending/i }));
    // After flip to desc: Sonnenweg (2200), Bergstrasse (1800), Seeblick (null last).
    await waitFor(() => {
      expect(columnOrder()).toEqual([
        "Sonnenweg 3",
        "Bergstrasse 12",
        "Seeblick 7",
      ]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-direction")).toBe(
      "desc"
    );
  });

  it("falls back to defaults when localStorage has invalid sort values", async () => {
    localStorage.setItem("flatpare-compare-sort-field", "bogus");
    localStorage.setItem("flatpare-compare-sort-direction", "sideways");
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    // Default rentChf asc.
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
  });

  it("hidden columns compose with sort order", async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    // Hide Bergstrasse (the middle-cheapest). The close button lives in its
    // column header. We click the × nearest Bergstrasse's name.
    const bergstrasseCol = screen.getByText("Bergstrasse 12").closest("th");
    const closeBtn = bergstrasseCol!.querySelector(
      "button"
    ) as HTMLButtonElement;
    await user.click(closeBtn);

    // Now only Sonnenweg and Seeblick remain. Default sort is rentChf asc —
    // Sonnenweg (2200) first, Seeblick (null) last.
    await waitFor(() => {
      expect(columnOrder()).toEqual(["Sonnenweg 3", "Seeblick 7"]);
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/app/compare/__tests__/compare-page.test.tsx`
Expected: all 6 tests fail — no sort UI and no sort applied yet (the page renders columns in API-response order, not `rentChf` asc).

- [ ] **Step 3: Wire sort state into `src/app/compare/page.tsx`**

Open `src/app/compare/page.tsx`. Apply the following changes:

**A) Imports.** Near the top, add `useMemo` to the React import and extend the lucide-react import. Replace the existing import line for `lucide-react` (`import { BarChart3 } from "lucide-react";`) with:

```tsx
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
```

Change `import { useEffect, useState } from "react";` to:

```tsx
import { useEffect, useMemo, useState } from "react";
```

Add these new imports below the existing `@/lib/fetch-error` import:

```tsx
import {
  compareApartments,
  COMPARE_SORT_CHANGE_EVENT,
  COMPARE_SORT_DIRECTION_STORAGE_KEY,
  COMPARE_SORT_FIELD_LABELS,
  COMPARE_SORT_FIELD_STORAGE_KEY,
  isSortDirection,
  isSortField,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import { usePersistedEnum } from "@/lib/use-persisted-enum";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

**B) Module-level `COMPARE_SORT_FIELD_IDS`.** After the existing `ratingLabels` declaration (just before `export default function ComparePage()`), add:

```tsx
const COMPARE_SORT_FIELD_IDS = Object.keys(
  COMPARE_SORT_FIELD_LABELS
) as SortField[];
```

**C) Hook calls + sort memo.** Inside `ComparePage()`, after the existing `const [error, setError] = useState<ErrorState | null>(null);` line, add:

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

Find the existing `const visible = apartments.filter((a) => !hiddenIds.has(a.id));` line (around line 131). Immediately after it, add:

```tsx
const sortedVisible = useMemo(() => {
  return [...visible].sort((a, b) =>
    compareApartments(a, b, sortField, sortDirection)
  );
}, [visible, sortField, sortDirection]);
```

**D) Replace iteration sites.** Every occurrence of `visible.map(` where apartment columns are rendered — there are six — must become `sortedVisible.map(`. Leave `visible.filter(...)`, `visible.length`, `visible.flatMap(...)`, and `visible` as used inside `findBest` as-is (those don't depend on order; column order must sort, but the "best value" is a set aggregate and the unique-users set is unordered).

The six column-iteration sites are:
1. Inside the header row, mapping apartment `<th>` elements (around line 188).
2. In the metric rows, mapping each `<td>` (around line 228).
3. In the ratings-section header (around line 254).
4. In the per-user rating rows (around line 294).
5. In the washing-machine row (around line 319).
6. In the comments row (around line 350).

Change each from `visible.map(` to `sortedVisible.map(`.

**E) Add the sort controls to the header.** Replace the existing `<div className="flex items-center justify-between">` block (lines 168–179 in the current file — containing the `<h1>` and the conditional "Show all" button) with:

```tsx
<div className="flex items-center justify-between gap-3">
  <h1 className="text-2xl font-semibold">Compare</h1>
  <div className="flex items-center gap-2">
    <Select
      value={sortField}
      onValueChange={(value) => setSortField(value as SortField)}
    >
      <SelectTrigger aria-label="Sort by" className="h-8 w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COMPARE_SORT_FIELD_IDS.map((id) => (
          <SelectItem key={id} value={id}>
            {COMPARE_SORT_FIELD_LABELS[id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={sortDirection === "asc" ? "Ascending" : "Descending"}
      onClick={() =>
        setSortDirection(sortDirection === "asc" ? "desc" : "asc")
      }
      className="h-8 w-8 p-0"
    >
      {sortDirection === "asc" ? (
        <ArrowUp className="h-4 w-4" />
      ) : (
        <ArrowDown className="h-4 w-4" />
      )}
    </Button>
    {hiddenIds.size > 0 && (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setHiddenIds(new Set())}
      >
        Show all ({hiddenIds.size} hidden)
      </Button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Run the compare-page tests — should pass**

Run: `npm test -- src/app/compare/__tests__/compare-page.test.tsx`
Expected: 6 tests pass.

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, lint clean.

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/app/compare/page.tsx src/app/compare/__tests__/compare-page.test.tsx
git commit -m "feat: add sort controls to compare view (#63)"
```

---

## Task 3: Open PR

**Files:** none — workflow only.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 63-compare-sort`
Expected: branch published to origin.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: sort options on compare view (#63)" \
  --body "$(cat <<'EOF'
## Summary
- Ten sortable fields on \`/compare\`: Date added, Price, Size, Rooms, Bathrooms, Balconies, Bike to SBB, Transit to SBB, Avg rating, Short code
- Asc/desc toggle, persisted to its own localStorage keys independent of the apartments-list sort
- Defaults to \`rentChf\` ascending (cheapest leftmost)
- Extended \`src/lib/apartment-sort.ts\` with the 4 compare-specific fields and a \`COMPARE_SORT_FIELD_LABELS\` map; comparator itself unchanged

## Test plan
- [ ] \`npm test\` passes (4 new comparator unit tests + 6 new integration tests)
- [ ] \`npm run lint\` clean
- [ ] \`npm run build\` succeeds
- [ ] Vercel preview: open \`/compare\`, verify default order is cheapest-first with null-rent last; try each sort field and the direction toggle; verify hiding a column doesn't break the sort; reload to confirm persistence.

Closes #63

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI**

Run: `gh pr checks --watch`
Expected: all checks pass.

- [ ] **Step 4: Hand back to the controller** — merge decision belongs to the user.

---

## Self-Review Checklist

**Spec coverage:**
- 10 sort fields across both list-view and compare-view metrics — Task 1 ✓
- Asc/desc toggle — Task 2 Step 3 ✓
- Independent localStorage keys (`flatpare-compare-sort-field` / `-direction`, event `flatpare-compare-sort-change`) — Task 1 Step 3 ✓
- Default `rentChf` asc — Task 2 Step 3 (hook initializers) ✓
- Invalid localStorage falls back to defaults — inherited from `usePersistedEnum` + `isSortField`/`isSortDirection`; asserted in Task 2 test 5 ✓
- Sort applied to column order — Task 2 Step 3 D (all six iteration sites) ✓
- Hidden-ids filter composes with sort — Task 2 Step 3 C (filter first, then sort) + Task 2 test 6 ✓
- `SortField` union grows by 4 — Task 1 Step 3 ✓
- `SortableApartment` grows by 4 — Task 1 Step 3 ✓
- New extractors for numeric fields — Task 1 Step 3 ✓
- `SORT_FIELD_LABELS` unchanged (list page keeps its 6-entry set) — explicit in Task 1 Step 3 ✓
- `SORT_FIELD_IDS` re-rooted at superset — Task 1 Step 3 ✓
- `COMPARE_SORT_FIELD_LABELS` 10 entries — Task 1 Step 3 ✓
- `useApartmentPager` unchanged — N/A (no change required, verified by running full suite in Task 1 Step 5) ✓
- 4 new comparator tests — Task 1 Step 1 ✓
- 6 new integration tests — Task 2 Step 1 ✓
- No URL query sync / no multi-key / no server-side preferences — N/A (out of scope) ✓

**Placeholder scan:** no TBDs, no "implement error handling later", every code step has complete code.

**Type consistency:**
- `SortField`, `SortDirection`, `SortableApartment` used uniformly across Task 1 and Task 2.
- `COMPARE_SORT_FIELD_LABELS`, `COMPARE_SORT_FIELD_STORAGE_KEY`, `COMPARE_SORT_DIRECTION_STORAGE_KEY`, `COMPARE_SORT_CHANGE_EVENT` defined in Task 1, consumed in Task 2.
- `usePersistedEnum<T>`, `compareApartments`, `isSortField`, `isSortDirection` are pre-existing exports; their signatures match the Task 2 call sites exactly (verified against `src/lib/apartment-sort.ts` and `src/lib/use-persisted-enum.ts`).
- The `ApartmentWithRatings` interface in `src/app/compare/page.tsx` is a structural superset of `SortableApartment` (after Task 1's extension of `SortableApartment`), so `compareApartments(apt, apt, ...)` on values typed `ApartmentWithRatings` type-checks without a cast. Confirmed by inspecting both interfaces.

No gaps.
