# Compare Column Header Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the apartment name in each compare-view column header into a link to the detail page and add small PDF / Listing icon links alongside it. All three open in a new tab so the compare view stays intact.

**Architecture:** Edit one render block in `src/app/compare/page.tsx`. Widen `ApartmentWithRatings` by two optional-valued URL fields. Extend the existing `compare-page.test.tsx` with a new `describe` block for link behavior and update the fixture to populate the URLs on two of three apartments.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + React Testing Library, Tailwind, `lucide-react` icons.

**Spec:** [`docs/superpowers/specs/2026-04-24-compare-column-links-design.md`](../specs/2026-04-24-compare-column-links-design.md)
**Issue:** [#64](https://github.com/brlauuu/flatpare/issues/64)

---

## File Structure

### Files modified

- `src/app/compare/page.tsx` — widen `ApartmentWithRatings` with `pdfUrl` / `listingUrl`; extend the `lucide-react` import; replace the name `<div>` with a three-element flex row (anchor for name, optional anchor for PDF, optional anchor for listing).
- `src/app/compare/__tests__/compare-page.test.tsx` — populate `pdfUrl` / `listingUrl` on Sonnenweg and Bergstrasse fixtures; append a new `describe("Compare page — column header links", ...)` block with 5 tests.

### No new files. No API or schema changes.

---

## Task 1: Ship column header links (single-task plan)

One coherent change: one source file + one test file. TDD ordering — tests first, implementation second.

**Files:**
- Modify: `src/app/compare/page.tsx`
- Modify: `src/app/compare/__tests__/compare-page.test.tsx`

### Step 1: Update fixture URLs in `compare-page.test.tsx`

In `src/app/compare/__tests__/compare-page.test.tsx`, locate the `DETAILS` constant (near the top of the file). Each fixture object currently omits `pdfUrl` and `listingUrl`. Add them as follows, keeping every other field intact:

- `id: 1` (Sonnenweg 3) — add `pdfUrl: "https://example.com/sonnenweg.pdf"`, `listingUrl: null`.
- `id: 2` (Bergstrasse 12) — add `pdfUrl: null`, `listingUrl: "https://example.com/bergstrasse-listing"`.
- `id: 3` (Seeblick 7) — add `pdfUrl: null`, `listingUrl: null`.

Add both keys to every object (even null) so the TypeScript structural type stays consistent.

- [ ] **Step 2: Append the failing tests**

In `src/app/compare/__tests__/compare-page.test.tsx`, after the existing `describe("Compare page — sort", ...)` block closes, append:

```tsx
describe("Compare page — column header links", () => {
  it("renders the apartment name as a link to its detail page in a new tab", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: "Sonnenweg 3" });
    expect(link).toHaveAttribute("href", "/apartments/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a PDF icon link when pdfUrl is present", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    const pdfLink = screen.getByRole("link", {
      name: /View PDF for Sonnenweg 3/i,
    });
    expect(pdfLink).toHaveAttribute(
      "href",
      "https://example.com/sonnenweg.pdf"
    );
    expect(pdfLink).toHaveAttribute("target", "_blank");
  });

  it("hides the PDF icon link when pdfUrl is null", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: /View PDF for Bergstrasse 12/i })
    ).toBeNull();
  });

  it("renders an Original listing icon link when listingUrl is present", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    const listingLink = screen.getByRole("link", {
      name: /Original listing for Bergstrasse 12/i,
    });
    expect(listingLink).toHaveAttribute(
      "href",
      "https://example.com/bergstrasse-listing"
    );
    expect(listingLink).toHaveAttribute("target", "_blank");
  });

  it("hides the Original listing icon link when listingUrl is null", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: /Original listing for Seeblick 7/i })
    ).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `npm test -- src/app/compare/__tests__/compare-page.test.tsx`
Expected: 5 new tests fail — no anchors exist yet for name / PDF / listing. Existing 6 sort/hidden tests still pass (they only assert on text content and the close button, which are unchanged).

- [ ] **Step 4: Widen `ApartmentWithRatings` in `src/app/compare/page.tsx`**

Find the interface (around line 43). Add two fields:

```tsx
interface ApartmentWithRatings {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  distanceBikeMin: number | null;
  distanceTransitMin: number | null;
  pdfUrl: string | null;
  listingUrl: string | null;
  shortCode: string | null;
  ratings: {
    userName: string;
    kitchen: number;
    balconies: number;
    location: number;
    floorplan: number;
    overallFeeling: number;
    comment: string;
  }[];
}
```

(Only `pdfUrl` and `listingUrl` are new; keep other fields as they are.)

- [ ] **Step 5: Extend the `lucide-react` import**

Current import at the top of `src/app/compare/page.tsx`:

```tsx
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
```

Replace with:

```tsx
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ExternalLink,
  FileText,
} from "lucide-react";
```

- [ ] **Step 6: Replace the column-header name block**

Find the column-header content — inside `thead` > `tr` > the `sortedVisible.map((apt) => ...)` block — there is a `<div className="space-y-1">` containing:

```tsx
<div className="space-y-1">
  <div className="font-semibold">{apt.name}</div>
  <ShortCode code={apt.shortCode} />
  {apt.address && (
    <AddressLink
      address={apt.address}
      className="text-xs font-normal text-muted-foreground"
    />
  )}
</div>
```

Replace the inner `<div className="font-semibold">{apt.name}</div>` with a new flex row holding the name anchor plus the two optional icon anchors. The resulting block:

```tsx
<div className="space-y-1">
  <div className="flex items-center gap-1.5">
    <a
      href={`/apartments/${apt.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold hover:underline"
    >
      {apt.name}
    </a>
    {apt.pdfUrl && (
      <a
        href={apt.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View PDF for ${apt.name}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <FileText className="h-3.5 w-3.5" />
      </a>
    )}
    {apt.listingUrl && (
      <a
        href={apt.listingUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Original listing for ${apt.name}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    )}
  </div>
  <ShortCode code={apt.shortCode} />
  {apt.address && (
    <AddressLink
      address={apt.address}
      className="text-xs font-normal text-muted-foreground"
    />
  )}
</div>
```

- [ ] **Step 7: Run the compare-page tests — should pass**

Run: `npm test -- src/app/compare/__tests__/compare-page.test.tsx`
Expected: 11 tests pass (6 existing + 5 new).

- [ ] **Step 8: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (186 total = prior 181 + 5 new), lint clean.

- [ ] **Step 9: Run the build**

Run: `npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/compare/page.tsx src/app/compare/__tests__/compare-page.test.tsx
git commit -m "feat: link apartment names, PDFs, and listings in compare view (#64)"
```

---

## Task 2: Open PR

**Files:** none — workflow only.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 64-compare-column-links`
Expected: branch published.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: link apartment names, PDFs, and listings in compare view (#64)" \
  --body "$(cat <<'EOF'
## Summary
- Compare view column headers: apartment name is now a link to the detail page; small PDF and Listing icons appear next to it when those URLs are set; all three open in a new tab so the compare view (sort + hidden columns) stays intact.
- Widened the compare page's \`ApartmentWithRatings\` type with \`pdfUrl\` / \`listingUrl\` (both already returned by the detail API).

## Test plan
- [x] \`npm test\` passes (5 new tests, 186 total)
- [x] \`npm run lint\` clean
- [x] \`npm run build\` succeeds
- [ ] Vercel preview: open \`/compare\`, verify each name is a link that opens the detail page in a new tab; verify PDF/Listing icons appear only when the underlying URL is set; confirm hidden columns and sort order survive across clicks.

Closes #64

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Hand back to the controller** — merge decision belongs to the user.

---

## Self-Review Checklist

**Spec coverage:**
- Name → detail page (new tab): Task 1 Step 6 ✓
- PDF icon (new tab, hidden when null): Task 1 Step 6 + tests 2, 3 ✓
- Listing icon (new tab, hidden when null): Task 1 Step 6 + tests 4, 5 ✓
- All three use `target="_blank"` + `rel="noopener noreferrer"`: Task 1 Step 6 ✓
- `ApartmentWithRatings` widened with `pdfUrl` / `listingUrl`: Task 1 Step 4 ✓
- Close button stays where it is: unchanged (Task 1 Step 6 only touches the inner content block) ✓
- Fixture exercises all 4 URL states (pdfUrl only, listingUrl only, neither — both provides only needed coverage per spec): Task 1 Step 1 ✓
- Existing 6 sort / hidden tests remain green: verified in Task 1 Step 3 ("existing tests still pass") and Task 1 Step 7 (11 pass after) ✓

**Placeholder scan:** no TBDs, no generic "handle edge case" phrases. Each code step shows full code.

**Type consistency:**
- `apt.pdfUrl` / `apt.listingUrl` are accessed in Task 1 Step 6; the interface gains them in Task 1 Step 4 (same file, earlier step).
- `FileText` and `ExternalLink` are imported in Task 1 Step 5 before use in Step 6.
- Fixture keys (`pdfUrl`, `listingUrl`) match the interface exactly.

No gaps.
