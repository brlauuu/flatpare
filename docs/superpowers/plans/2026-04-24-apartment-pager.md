# Apartment Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Previous / Next buttons to `/apartments/[id]` that navigate between apartments in the order set by the list page's sort controls. Works on direct URL navigation.

**Architecture:** A new `useApartmentPager(currentId)` hook fetches `/api/apartments` once on mount, reads the sort preference from localStorage (two keys already shipped in #61), sorts client-side with the existing `compareApartments`, and derives `position`, `prevId`, `nextId`. The detail page renders a compact pager row above the apartment header and calls `router.push` on click. A small refactor moves the sort localStorage keys and validators from `src/app/apartments/page.tsx` into `src/lib/apartment-sort.ts` so both pages import from one place.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + React Testing Library (with `renderHook`), Tailwind, `lucide-react` icons.

**Spec:** [`docs/superpowers/specs/2026-04-24-apartment-pager-design.md`](../specs/2026-04-24-apartment-pager-design.md)
**Issue:** [#62](https://github.com/brlauuu/flatpare/issues/62)

---

## File Structure

### Files created

- `src/lib/use-apartment-pager.ts` — hook: fetches list, reads sort, derives prev/current/next.
- `src/lib/__tests__/use-apartment-pager.test.tsx` — hook unit tests via `renderHook`.
- `src/app/apartments/[id]/__tests__/pager.test.tsx` — detail-page integration tests for the pager UI.

### Files modified

- `src/lib/apartment-sort.ts` — additionally exports `SORT_FIELD_STORAGE_KEY`, `SORT_DIRECTION_STORAGE_KEY`, `SORT_CHANGE_EVENT`, `SORT_FIELD_IDS`, `isSortField`, `isSortDirection`.
- `src/app/apartments/page.tsx` — remove local definitions of the above, import them from `@/lib/apartment-sort`.
- `src/app/apartments/[id]/page.tsx` — add `useApartmentPager` call and render the pager row above the existing header block.

### No renames / deletions.

---

## Task 1: Move sort constants and validators into `apartment-sort.ts`

Pure refactor to give both the list page and the new hook a single source of truth for sort-related localStorage keys and validators. Zero behavior change.

**Files:**
- Modify: `src/lib/apartment-sort.ts` (add exports at the bottom)
- Modify: `src/app/apartments/page.tsx` (remove local defs, import from the shared module)

- [ ] **Step 1: Add exports to `src/lib/apartment-sort.ts`**

Append these exports to the end of the file:

```ts
export const SORT_FIELD_STORAGE_KEY = "flatpare-apartments-sort-field";
export const SORT_DIRECTION_STORAGE_KEY = "flatpare-apartments-sort-direction";
export const SORT_CHANGE_EVENT = "flatpare-apartments-sort-change";

export const SORT_FIELD_IDS = Object.keys(SORT_FIELD_LABELS) as SortField[];

export function isSortField(v: string): v is SortField {
  return (SORT_FIELD_IDS as string[]).includes(v);
}

export function isSortDirection(v: string): v is SortDirection {
  return v === "asc" || v === "desc";
}
```

- [ ] **Step 2: Remove local copies from `src/app/apartments/page.tsx`**

Delete lines that define `SORT_FIELD_STORAGE_KEY`, `SORT_DIRECTION_STORAGE_KEY`, `SORT_CHANGE_EVENT`, `SORT_FIELD_IDS`, `isSortField`, `isSortDirection` from `src/app/apartments/page.tsx`. Extend the existing import from `@/lib/apartment-sort` to include them:

```tsx
import {
  compareApartments,
  SORT_FIELD_LABELS,
  SORT_FIELD_STORAGE_KEY,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_CHANGE_EVENT,
  SORT_FIELD_IDS,
  isSortField,
  isSortDirection,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
```

(Your existing import may be partial; replace it entirely with the block above.)

- [ ] **Step 3: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (existing view-toggle + sort tests on the list page), no lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/apartment-sort.ts src/app/apartments/page.tsx
git commit -m "refactor: move sort constants and validators into apartment-sort module"
```

---

## Task 2: `useApartmentPager` hook with TDD

Write the hook's unit tests first, then implement. The hook fetches the list, reads sort state once, and returns `position` / `prevId` / `nextId` plus loading/error metadata.

**Files:**
- Create: `src/lib/use-apartment-pager.ts`
- Test: `src/lib/__tests__/use-apartment-pager.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/use-apartment-pager.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useApartmentPager } from "@/lib/use-apartment-pager";

const LIST = [
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

// Default (createdAt desc) order: Bergstrasse (id 2), Seeblick (id 3), Sonnenweg (id 1).

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(LIST),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useApartmentPager", () => {
  it("returns loading state initially", () => {
    const { result } = renderHook(() => useApartmentPager(2));
    expect(result.current.loading).toBe(true);
    expect(result.current.total).toBe(0);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("resolves to correct position and neighbors under default sort (createdAt desc)", async () => {
    // Default order: Bergstrasse (2, newest), Seeblick (3), Sonnenweg (1, oldest).
    // Middle apartment = Seeblick (id 3): position 2, prev 2, next 1.
    const { result } = renderHook(() => useApartmentPager(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe(2);
    expect(result.current.nextId).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("honors sort preference stored in localStorage", async () => {
    // rentChf asc: Bergstrasse (1800, id 2), Sonnenweg (2200, id 1), Seeblick (null last, id 3).
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    const { result } = renderHook(() => useApartmentPager(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe(2);
    expect(result.current.nextId).toBe(3);
  });

  it("returns prevId null on the first apartment in order", async () => {
    // Default order: Bergstrasse (2) is first.
    const { result } = renderHook(() => useApartmentPager(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.position).toBe(1);
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBe(3);
  });

  it("returns nextId null on the last apartment in order", async () => {
    // Default order: Sonnenweg (1) is last.
    const { result } = renderHook(() => useApartmentPager(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.position).toBe(3);
    expect(result.current.prevId).toBe(3);
    expect(result.current.nextId).toBeNull();
  });

  it("returns null position and null ids when current id is not in the list", async () => {
    const { result } = renderHook(() => useApartmentPager(9999));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
  });

  it("falls back to defaults when localStorage has invalid sort values", async () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");
    const { result } = renderHook(() => useApartmentPager(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Defaults → createdAt desc → Seeblick is position 2.
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe(2);
    expect(result.current.nextId).toBe(1);
  });

  it("surfaces an error when the list fetch fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      clone() {
        return this;
      },
      text: () => Promise.resolve("boom"),
      headers: new Headers(),
    } as unknown as Response);

    const { result } = renderHook(() => useApartmentPager(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.total).toBe(0);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
  });

  // Silence unused-import warning without removing act (exported here
  // to signal the hook is designed to work with `act` in future tests).
  void act;
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- src/lib/__tests__/use-apartment-pager.test.tsx`
Expected: all 8 tests fail with `Cannot find module '@/lib/use-apartment-pager'`.

- [ ] **Step 3: Create the hook**

Create `src/lib/use-apartment-pager.ts`:

```ts
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareApartments,
  isSortDirection,
  isSortField,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_FIELD_STORAGE_KEY,
  type SortableApartment,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import {
  type ErrorDetails,
  fetchErrorFromException,
  fetchErrorFromResponse,
} from "@/lib/fetch-error";

export interface ApartmentPagerResult {
  loading: boolean;
  error: ErrorDetails | null;
  total: number;
  position: number | null;
  prevId: number | null;
  nextId: number | null;
}

function readSortField(): SortField {
  const raw = window.localStorage.getItem(SORT_FIELD_STORAGE_KEY);
  return raw !== null && isSortField(raw) ? raw : "createdAt";
}

function readSortDirection(): SortDirection {
  const raw = window.localStorage.getItem(SORT_DIRECTION_STORAGE_KEY);
  return raw !== null && isSortDirection(raw) ? raw : "desc";
}

export function useApartmentPager(currentId: number): ApartmentPagerResult {
  const [apartments, setApartments] = useState<SortableApartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  // Read sort preference once on mount — detail page does not need same-tab
  // sync because the user cannot change sort while on the detail page.
  const [sortField] = useState<SortField>(() => readSortField());
  const [sortDirection] = useState<SortDirection>(() => readSortDirection());

  useEffect(() => {
    let cancelled = false;
    const url = "/api/apartments";
    (async () => {
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          setError(await fetchErrorFromResponse(res, url));
          setLoading(false);
          return;
        }
        const data = (await res.json()) as SortableApartment[];
        if (cancelled) return;
        setApartments(data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(fetchErrorFromException(err, url));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (loading || error) {
      return {
        loading,
        error,
        total: apartments.length,
        position: null,
        prevId: null,
        nextId: null,
      };
    }
    const sorted = [...apartments].sort((a, b) =>
      compareApartments(a, b, sortField, sortDirection)
    );
    const index = sorted.findIndex((a) => a.id === currentId);
    if (index === -1) {
      return {
        loading: false,
        error: null,
        total: sorted.length,
        position: null,
        prevId: null,
        nextId: null,
      };
    }
    return {
      loading: false,
      error: null,
      total: sorted.length,
      position: index + 1,
      prevId: index > 0 ? sorted[index - 1].id : null,
      nextId: index < sorted.length - 1 ? sorted[index + 1].id : null,
    };
  }, [loading, error, apartments, sortField, sortDirection, currentId]);
}
```

- [ ] **Step 4: Run the tests — they should pass**

Run: `npm test -- src/lib/__tests__/use-apartment-pager.test.tsx`
Expected: 8 tests pass.

- [ ] **Step 5: Full suite + lint**

Run: `npm test && npm run lint`
Expected: all tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/use-apartment-pager.ts src/lib/__tests__/use-apartment-pager.test.tsx
git commit -m "feat: add useApartmentPager hook"
```

---

## Task 3: Render the pager in the apartment detail page

Wire `useApartmentPager` into `src/app/apartments/[id]/page.tsx` and render a compact row above the apartment header. Write integration tests in a new file (detail page already has two other test files; add a third for the pager).

**Files:**
- Modify: `src/app/apartments/[id]/page.tsx`
- Test: `src/app/apartments/[id]/__tests__/pager.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Create `src/app/apartments/[id]/__tests__/pager.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
let currentParamsId = "3";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: currentParamsId }),
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

import ApartmentDetailPage from "../page";

const LIST = [
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

function apartmentResponse(id: number) {
  const apt = LIST.find((a) => a.id === id);
  return {
    ok: true,
    json: () => Promise.resolve({ ...apt, ratings: [] }),
  } as Response;
}

function listResponse() {
  return {
    ok: true,
    json: () => Promise.resolve(LIST),
  } as Response;
}

beforeEach(() => {
  localStorage.clear();
  pushMock.mockReset();
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/apartments") return Promise.resolve(listResponse());
    const match = url.match(/\/api\/apartments\/(\d+)$/);
    if (match) return Promise.resolve(apartmentResponse(Number(match[1])));
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartment detail page — pager", () => {
  it("renders position and enabled buttons for a middle apartment", async () => {
    currentParamsId = "3"; // Seeblick — middle under default sort
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("2 of 3")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Previous/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("clicking Next navigates to nextId", async () => {
    currentParamsId = "3"; // Seeblick → next is Sonnenweg (id 1) under default sort.
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("2 of 3")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(pushMock).toHaveBeenCalledWith("/apartments/1");
  });

  it("disables Previous on the first apartment", async () => {
    currentParamsId = "2"; // Bergstrasse — first under default sort.
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("1 of 3")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("disables Next on the last apartment and Previous navigates", async () => {
    currentParamsId = "1"; // Sonnenweg — last under default sort.
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("3 of 3")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Previous/i }));
    expect(pushMock).toHaveBeenCalledWith("/apartments/3");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/app/apartments/\[id\]/__tests__/pager.test.tsx`
Expected: all 4 tests fail — no pager UI yet.

- [ ] **Step 3: Wire the pager into the detail page**

Edit `src/app/apartments/[id]/page.tsx`.

Add imports near the top (with the other imports):

```tsx
import { ArrowLeft, ArrowRight, WashingMachine } from "lucide-react";
import { useApartmentPager } from "@/lib/use-apartment-pager";
```

(The existing `import { WashingMachine } from "lucide-react"` is being extended to also import the arrow icons. If your editor prefers separate import lines, that's fine — the end result must import all three.)

Inside `ApartmentDetailPage()`, near the other hook calls (after `const params = useParams();` and any existing `useState`/`useEffect` declarations — before the `if (loading)` / `if (error)` early returns), add:

```tsx
const pager = useApartmentPager(Number(params.id));
```

In the JSX, inside the top-level `<div className="space-y-6">` (around line 311), insert the pager row as the FIRST child — immediately above the existing `<div className="flex items-start justify-between">` header row:

```tsx
<div className="flex items-center gap-3">
  <Button
    type="button"
    variant="outline"
    size="sm"
    disabled={pager.prevId === null}
    onClick={() => {
      if (pager.prevId !== null) router.push(`/apartments/${pager.prevId}`);
    }}
  >
    <ArrowLeft className="h-4 w-4" />
    Previous
  </Button>
  {pager.position !== null && pager.total > 0 && (
    <span className="text-sm text-muted-foreground">
      {pager.position} of {pager.total}
    </span>
  )}
  <Button
    type="button"
    variant="outline"
    size="sm"
    disabled={pager.nextId === null}
    onClick={() => {
      if (pager.nextId !== null) router.push(`/apartments/${pager.nextId}`);
    }}
  >
    Next
    <ArrowRight className="h-4 w-4" />
  </Button>
</div>
```

Placement note: the wrapping `<div className="space-y-6">` adds vertical spacing between children, so the pager row will sit above the header with the same gap as the other sections.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- src/app/apartments/\[id\]/__tests__/pager.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 5: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, lint clean.

- [ ] **Step 6: Run the build as a final check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/app/apartments/[id]/page.tsx \
        src/app/apartments/[id]/__tests__/pager.test.tsx
git commit -m "feat: add prev/next pager to apartment detail page (#62)"
```

---

## Task 4: Open PR and wrap up

**Files:** none — workflow only.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 62-apartment-pager`
Expected: branch published to origin.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: prev/next pager on apartment detail (#62)" \
  --body "$(cat <<'EOF'
## Summary
- New \`useApartmentPager\` hook fetches the apartment list and derives \`position\`, \`prevId\`, \`nextId\` from the user's current sort preference in localStorage (respects #61 sort)
- Detail page gets a compact "[← Previous] N of M [Next →]" row above the header; buttons disabled at the edges
- Refactor: moved sort localStorage keys and validators from \`src/app/apartments/page.tsx\` into \`src/lib/apartment-sort.ts\` so both pages import from one place

## Test plan
- [ ] \`npm test\` passes (new: 8 hook tests + 4 integration tests)
- [ ] \`npm run lint\` clean
- [ ] \`npm run build\` succeeds
- [ ] Vercel preview: navigate between apartments with sort field/direction changed on list page, verify order

Closes #62

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI**

Run: `gh pr checks --watch`
Expected: all checks pass.

- [ ] **Step 4: Hand back to the controller** — merge decision is the user's.

---

## Self-Review Checklist

**Spec coverage:**
- Pager UI above header with Prev / position / Next — Task 3 ✓
- Disabled buttons at the edges — Task 3 Step 3 (`disabled={pager.prevId === null}`, etc.) ✓
- Sort source = localStorage keys from #61 — Task 2 Step 3 (`readSortField` / `readSortDirection`) ✓
- Read once on mount (no same-tab sync) — Task 2 Step 3 (lazy `useState` init) ✓
- Current-id-not-in-list edge case → `position: null`, both ids `null` — Task 2 Step 3 (findIndex → -1 path) + test coverage Task 2 Step 1 ✓
- Fetch error → disabled buttons, hidden position, no banner — Task 2 Step 3 (error branch returns nulls), Task 3 Step 3 (position only rendered when non-null), test coverage Task 2 Step 1 ✓
- Refactor shared sort helpers — Task 1 ✓
- SSR-safe: detail page is `"use client"`; hook does not run on the server (no initial-render localStorage read problem). The lazy `useState` initializer runs on mount in client components, consistent with the existing page's model.
- Works for direct URL navigation — the hook makes its own `/api/apartments` call, independent of the list page ✓

**Placeholder scan:** no TBDs, no "implement error handling", no "similar to Task N". Every code step has full code.

**Type consistency:**
- `useApartmentPager(currentId: number)` in Task 2 matches call site `Number(params.id)` in Task 3.
- `ApartmentPagerResult` fields (`loading`, `error`, `total`, `position`, `prevId`, `nextId`) match the spec and the integration test assertions.
- `SortableApartment` import from `@/lib/apartment-sort` is an existing export.
- The JSON shape returned by `/api/apartments` is an array of `ApartmentSummary`-shaped objects; `SortableApartment` is a structural subset, so the `as SortableApartment[]` cast in the hook is safe. (Same pattern as the list page already uses.)

No gaps.
