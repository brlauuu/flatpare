# Apartment Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a substring search input to `/apartments` that filters apartments by name, short code, or address, composing with the existing sort.

**Architecture:** One `useState` for the query + two `useMemo`s (filter then sort) local to `ApartmentsPage`. A new search-row sits above the existing header. When the query has no matches, the card grid is replaced with an empty-state panel; when the query is empty, rendering matches today's behavior exactly.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + React Testing Library, Tailwind, shadcn/ui (`Input`, `Button`), `lucide-react` icons.

**Spec:** [`docs/superpowers/specs/2026-04-24-apartment-search-design.md`](../specs/2026-04-24-apartment-search-design.md)
**Issue:** [#65](https://github.com/brlauuu/flatpare/issues/65)

---

## File Structure

### Files modified

- `src/app/apartments/page.tsx` — adds `useState<string>("")` for query; adds `filteredApartments` memo before the existing sort memo; the sort memo now reads `filteredApartments` instead of `apartments`; the top-level JSX gets a new search row at the very top, and a new empty-result branch between the "no apartments yet" branch and the main grid/list render. Extends the `lucide-react` import (`Search`, `X`) and adds a new `@/components/ui/input` import.
- `src/app/apartments/__tests__/apartments-page.test.tsx` — updates `APARTMENTS` fixture to give two apartments non-null `address`; adds a new `describe("Apartments page — search", ...)` block with 10 tests.

### No new files, no API or schema changes.

---

## Task 1: Ship search (single-task plan)

**Files:**
- Modify: `src/app/apartments/page.tsx`
- Modify: `src/app/apartments/__tests__/apartments-page.test.tsx`

### Step 1: Update fixture in `apartments-page.test.tsx`

Locate the `APARTMENTS` constant (near the top of the test file). Change the `address` fields:

- `id: 1` (Sonnenweg 3): `address: "Sonnenweg 3, 8001 Zürich"` (was `null`).
- `id: 2` (Bergstrasse 12): `address: "Bergstrasse 12, 8032 Zürich"` (was `null`).
- `id: 3` (Seeblick 7): `address: null` (unchanged).

Keep every other field intact.

- [ ] **Step 2: Run existing tests to confirm the fixture change is backward compatible**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: all 9 existing tests still pass — none of them assert on address text.

- [ ] **Step 3: Append the failing search tests**

At the end of `src/app/apartments/__tests__/apartments-page.test.tsx`, after the last existing `describe` block, append:

```tsx
describe("Apartments page — search", () => {
  it("renders an empty search input on mount and shows all apartments", async () => {
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    const input = screen.getByRole("textbox", { name: /Search apartments/i });
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
  });

  it("filters by name substring, case-insensitive", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "berg"
    );
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });

  it("filters by short code, case-insensitive", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "GHI"
    );
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Bergstrasse 12")).toBeNull();
  });

  it("filters by address", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "zürich"
    );
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });

  it("treats null address as empty — 'null' query matches nothing", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "null"
    );
    await waitFor(() => {
      expect(screen.getByText(/No apartments match "null"/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Bergstrasse 12")).toBeNull();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });

  it("renders empty-result state when the query matches no apartments", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "xyz"
    );
    await waitFor(() => {
      expect(screen.getByText(/No apartments match "xyz"/i)).toBeInTheDocument();
    });
  });

  it("'Show all apartments' button in the empty-result state resets the query", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "xyz"
    );
    await waitFor(() => {
      expect(screen.getByText(/No apartments match "xyz"/i)).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /Show all apartments/i })
    );
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: /Search apartments/i });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("inline Clear (X) button in the input resets the query", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "berg"
    );
    await waitFor(() => {
      expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    });
    await user.click(screen.getByRole("button", { name: /Clear search/i }));
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
  });

  it("whitespace-only query behaves as empty", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "  "
    );
    // No filtering — all three apartments still present, no empty-state text.
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    expect(screen.queryByText(/No apartments match/i)).toBeNull();
  });

  it("composes with sort: search narrows first, sort applies after", async () => {
    const user = userEvent.setup();
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "berg"
    );
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to confirm the 10 new ones fail**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: 10 new tests fail (no `textbox` with accessible name "Search apartments" exists yet). 9 existing tests still pass.

- [ ] **Step 5: Extend imports in `src/app/apartments/page.tsx`**

Locate the existing imports at the top of `src/app/apartments/page.tsx`.

Change the `lucide-react` import to add `Search` and `X` icons. The current import contains `Building2, CheckCircle2, Circle, LayoutGrid, List as ListIcon, ArrowUp, ArrowDown` (or similar — preserve every existing icon). Add `Search` and `X` to the same import:

```tsx
import {
  Building2,
  CheckCircle2,
  Circle,
  LayoutGrid,
  List as ListIcon,
  ArrowUp,
  ArrowDown,
  Search,
  X,
} from "lucide-react";
```

(If the existing order differs in the actual file, preserve it and just append `Search` and `X` — the set of names matters, not the order.)

Add a new import for the Input component below the existing `@/components/ui/button` line:

```tsx
import { Input } from "@/components/ui/input";
```

- [ ] **Step 6: Add query state and filter memo inside `ApartmentsPage()`**

Inside `ApartmentsPage()`, find the existing `const sortedApartments = useMemo(() => ...)` block. Above it (right after the two `usePersistedEnum` calls for sort), add the search state and the filter memo, then update the sort memo to consume `filteredApartments`:

```tsx
const [query, setQuery] = useState("");

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

The only change to the existing sort memo is the source array (`apartments` → `filteredApartments`) and its dependency array.

- [ ] **Step 7: Add the search row to the JSX**

In the main return block, find the current top-level container. It currently looks like this:

```tsx
return (
  <div className="space-y-6">
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">Apartments</h1>
      {/* ...sort + view + upload controls... */}
    </div>
    {/* grid or list */}
  </div>
);
```

Insert a new search row as the FIRST child of the top-level `<div className="space-y-6">`, BEFORE the existing `<div className="flex items-center justify-between gap-3">` header:

```tsx
<div className="relative w-full max-w-sm">
  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input
    type="text"
    aria-label="Search apartments"
    placeholder="Search by name, code, or address..."
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    className="h-9 pl-9 pr-9"
  />
  {query.length > 0 && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Clear search"
      onClick={() => setQuery("")}
      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
    >
      <X className="h-4 w-4" />
    </Button>
  )}
</div>
```

- [ ] **Step 8: Replace the grid/list render with a query-aware branch**

Find the JSX block that renders the grid or list (the existing `if (apartments.length === 0)` early return stays as-is). That block currently looks roughly like:

```tsx
{view === "grid" ? (
  <div data-view="grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {sortedApartments.map((apt) => (
      <Link ...>...</Link>
    ))}
  </div>
) : (
  <div data-view="list" className="divide-y overflow-hidden rounded-lg border">
    {sortedApartments.map((apt) => (
      <Link ...>...</Link>
    ))}
  </div>
)}
```

Wrap it in a conditional so the empty-result state replaces the grid when the filtered list is empty AND the query is non-empty:

```tsx
{sortedApartments.length === 0 && query.trim() !== "" ? (
  <div className="flex flex-col items-center justify-center gap-4 py-20">
    <div className="rounded-full bg-muted p-4">
      <Search className="h-8 w-8 text-muted-foreground" />
    </div>
    <div className="text-center">
      <p className="font-medium">No apartments match &ldquo;{query.trim()}&rdquo;</p>
    </div>
    <Button variant="outline" onClick={() => setQuery("")}>
      Show all apartments
    </Button>
  </div>
) : view === "grid" ? (
  <div data-view="grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {sortedApartments.map((apt) => (
      /* existing Link ... */
    ))}
  </div>
) : (
  <div data-view="list" className="divide-y overflow-hidden rounded-lg border">
    {sortedApartments.map((apt) => (
      /* existing Link ... */
    ))}
  </div>
)}
```

Leave the inner `<Link>` contents for each card unchanged — they are not affected by search.

- [ ] **Step 9: Run the apartments-page tests — should pass**

Run: `npm test -- src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: 19 tests pass (9 existing + 10 new).

- [ ] **Step 10: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (196 total = prior 186 + 10 new), lint clean.

- [ ] **Step 11: Run the build**

Run: `npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 12: Commit**

```bash
git add src/app/apartments/page.tsx src/app/apartments/__tests__/apartments-page.test.tsx
git commit -m "feat: add search bar to apartments list (#65)"
```

---

## Task 2: Open PR

**Files:** none — workflow only.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 65-apartment-search`
Expected: branch published.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: apartments list search (#65)" \
  --body "$(cat <<'EOF'
## Summary
- New search input above the apartments header; filters by name, short code, or address (case-insensitive substring).
- Composes with the existing sort (#61): search narrows first, then sort orders the remaining apartments.
- Empty-query fast path — renders identically to today when the query is empty.
- Empty-result state when the query yields zero matches, with a "Show all apartments" button.
- Inline \`X\` button inside the input for quick clearing. No persistence — query resets on reload.

## Test plan
- [x] \`npm test\` passes (10 new tests, 196 total)
- [x] \`npm run lint\` clean
- [x] \`npm run build\` succeeds
- [ ] Vercel preview: type partial names / short codes / addresses; verify filter; confirm sort re-applies to filtered set; try whitespace-only query (no-op); exercise both clear buttons.

Closes #65

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Hand back to the controller** — merge decision belongs to the user.

---

## Self-Review Checklist

**Spec coverage:**
- Search input placement (above h1/controls row): Task 1 Step 7 ✓
- shadcn `<Input>` with Search icon, placeholder, aria-label: Task 1 Step 7 ✓
- `w-full max-w-sm`, `h-9`: Task 1 Step 7 ✓
- Inline clear `X` button (visible only when query has chars, aria-label "Clear search"): Task 1 Step 7 ✓
- `useState<string>("")` local to page: Task 1 Step 6 ✓
- Trim + lowercase + substring match on name, shortCode, address: Task 1 Step 6 ✓
- Null field → empty string, never matches: Task 1 Step 6 (`apt.address?.toLowerCase() ?? ""`) ✓
- Two useMemos (filter then sort), empty-query fast path returns same reference: Task 1 Step 6 ✓
- Empty-result state with icon + headline + "Show all apartments" button: Task 1 Step 8 ✓
- Existing "no apartments yet" empty state unchanged: Task 1 Step 8 — it's a separate, earlier `if (apartments.length === 0)` branch the plan doesn't touch ✓
- No persistence: Task 1 Step 6 (plain useState, no hook) ✓
- No debounce: inherent (direct onChange); tests verify behavior is correct without one ✓
- 10 new tests covering all specified cases: Task 1 Step 3 (10 `it(...)` blocks matching the 10 spec items) ✓
- Existing 9 tests pass: Task 1 Step 2 verifies after fixture change; Step 9 verifies end-state ✓

**Placeholder scan:** no TBDs, no generic phrases like "handle edge case". Every code step shows complete code.

**Type consistency:**
- `query` (string), `setQuery` used uniformly across Steps 6, 7, 8.
- `filteredApartments` defined in Step 6, consumed in Step 6's sort memo update.
- `sortedApartments` still the final derived array rendered in Step 8.
- `Search` icon used in Step 7 AND Step 8 (in the empty state); both import from the lucide-react import extended in Step 5.
- `X` icon used in Step 7 only; imported in Step 5.
- `Input` imported in Step 5, consumed in Step 7.

No gaps.
