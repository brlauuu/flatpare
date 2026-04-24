# Compare view column header links — design

**Issue:** [#64 — In the compare tab, apartment names should be links](https://github.com/brlauuu/flatpare/issues/64)
**Date:** 2026-04-24

## Problem

The compare view at `/compare` shows each apartment as a column; the column header currently renders the apartment name as plain text. Users want to navigate to the apartment detail page, its PDF, or its original listing from the compare view without losing the compare state (hidden columns, sort).

## Scope

Make the apartment name a link to the detail page and add two small icon links for PDF and the original listing. All three open in a new tab. Icons hide when their underlying URL is null. One render block in `src/app/compare/page.tsx` changes; no new component extraction.

## UI

Column header layout changes only inside the left-hand content block (the close "✕" button stays as-is):

```
Before:
  <div className="font-semibold">{apt.name}</div>
  <ShortCode code={apt.shortCode} />
  {address && <AddressLink ... />}

After:
  <div className="flex items-center gap-1.5">
    <a href="/apartments/{id}" target="_blank" rel="noopener noreferrer"
       className="font-semibold hover:underline">{apt.name}</a>
    {pdfUrl && <a href={pdfUrl} target="_blank" ...><FileText .../></a>}
    {listingUrl && <a href={listingUrl} target="_blank" ...><ExternalLink .../></a>}
  </div>
  <ShortCode code={apt.shortCode} />
  {address && <AddressLink ... />}
```

### Details

- **Name anchor.** Plain `<a>`, not Next.js `<Link>`, because `target="_blank"` cross-origin-safe opens a fresh browser tab and bypasses client-side navigation — which is exactly what preserves the compare state. `className="font-semibold hover:underline"`. Default text color (no blue); hover-underline signals interactivity without visual noise.
- **PDF icon.** `<FileText>` from `lucide-react`, `className="h-3.5 w-3.5"`. Wrapped in `<a target="_blank" rel="noopener noreferrer" aria-label={`View PDF for ${apt.name}`} className="text-muted-foreground hover:text-foreground">`. Renders only when `apt.pdfUrl` is truthy.
- **Listing icon.** Same structure with `<ExternalLink>` and `aria-label={`Original listing for ${apt.name}`}`. Renders only when `apt.listingUrl` is truthy.
- **All three links** use `target="_blank"` and `rel="noopener noreferrer"` (the standard security hygiene for new-tab external links).

### Placements considered and rejected

- **Dropdown/popover on the name** — overkill for three links.
- **Single link target (pick one)** — user wants access to all three from compare without losing state.
- **Add links inside the row sections instead of the header** — dilutes the "this column is apartment X" signal.

## Data shape change

`ApartmentWithRatings` in `src/app/compare/page.tsx` currently omits `pdfUrl` and `listingUrl`. The detail API (`GET /api/apartments/[id]`) returns the entire DB row via `...apartment[0]` spread, so these fields are already in the payload — the TypeScript interface just hasn't declared them. Add both as `string | null` to the interface. No schema, migration, or API change needed.

## Testing

Add a new `describe("Compare page — column header links", ...)` block to `src/app/compare/__tests__/compare-page.test.tsx`. Update the existing fixture to populate `pdfUrl` on one apartment and `listingUrl` on another (and neither on the third) so all branches are exercised:

- Sonnenweg (id 1) → `pdfUrl: "https://example.com/sonnenweg.pdf"`, `listingUrl: null`.
- Bergstrasse (id 2) → `pdfUrl: null`, `listingUrl: "https://example.com/bergstrasse-listing"`.
- Seeblick (id 3) → both null.

### New tests

1. Apartment name renders as an anchor to `/apartments/{id}` with `target="_blank"`.
2. PDF icon link appears when `pdfUrl` is present; href matches; new tab.
3. PDF icon link is absent when `pdfUrl` is null.
4. Listing icon link appears when `listingUrl` is present; href matches; new tab.
5. Listing icon link is absent when `listingUrl` is null.

Queries use `getByRole("link", { name: ... })` and `queryByRole` for the absence cases. `aria-label` on the icon links gives them an accessible name the role query can match.

### Existing tests

The existing 6 compare-page tests (sort + hidden columns) rely on `getByText("Sonnenweg 3")`, `columnOrder()` (which queries `thead th .font-semibold`), and the "Hide {name}" close-button aria-label. All continue to work because:

- The name text still renders inside an element with `font-semibold` (just now an `<a>` instead of a `<div>`).
- `columnOrder` queries `.font-semibold` and will match the anchor's `textContent`.
- `getByText` matches text content regardless of wrapping tag.

## Out of scope

- No changes to the detail page's existing "View PDF" / "Original Listing" buttons.
- No visual redesign of the "URL missing" badge that shows on the detail page when `listingUrl` is null — that UI is specific to the detail view.
- No keyboard shortcut for jumping between linked columns.
- No preview / hover card for the destinations.
- No changes to the compare view's `ApartmentWithRatings` beyond adding `pdfUrl` and `listingUrl`.
