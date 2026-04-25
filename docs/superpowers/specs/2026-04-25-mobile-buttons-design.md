# Apartment detail header — mobile button stacking

**Issue:** [#80 — On the apartment page on mobile phone, buttons should be one below another and not next to another. When they're next to another they stretch the page](https://github.com/brlauuu/flatpare/issues/80)
**Date:** 2026-04-25

## Problem

The header on `/apartments/[id]` puts the title block (ShortCode + name + address) on the left and four action elements (View PDF, Original Listing or "URL missing" badge, Edit, Delete) on the right inside a single `flex items-start justify-between` row. On a phone-width viewport, the right cluster overflows horizontally and stretches the page beyond the viewport.

## Scope

CSS-only change, single file. Replace flex utility classes on two containers and add `w-full sm:w-auto` to each interactive child so:

- **Mobile (`<sm`):** title block on top, buttons stacked vertically below in a full-width column.
- **Desktop (`sm+`, ≥640px):** unchanged from today — title left, buttons right, single row.

## Changes

`src/app/apartments/[id]/page.tsx`, header section only:

### Outer wrapper

```diff
-<div className="flex items-start justify-between">
+<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
```

### Action button row (immediately inside, on the right at desktop)

```diff
-<div className="flex items-center gap-2">
+<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
```

### Each interactive child

Add `w-full sm:w-auto` to:

- `<a>View PDF</a>` — extend the existing `buttonVariants(...)` className with `cn(...)` or a string-concat to include `"w-full sm:w-auto"`.
- `<a>Original Listing</a>` — same treatment.
- `<Badge>URL missing</Badge>` — add `"w-full sm:w-auto justify-center sm:justify-start"` so the centered text reads naturally when full-width on mobile.
- `<Button>Edit</Button>` — add `className="w-full sm:w-auto"`.
- `<Button>Delete</Button>` — same.

The existing `cn` helper from `@/lib/utils` is already imported in this file (used elsewhere in the page) — use it for the `<a>` elements:

```tsx
className={cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  "w-full sm:w-auto"
)}
```

### Out of scope

- The pager row above (Previous / position / Next) — three elements, fits comfortably on mobile already. Not touching.
- Other pages.
- The right-aligned column's vertical alignment relative to the title on desktop — `sm:items-start` preserves today's behavior.

## Testing

No test added. Vitest with jsdom doesn't apply CSS or Tailwind breakpoints; a test would only assert that classes are present, which is low-value. The fix is verified visually on the Vercel preview by resizing the viewport (or opening on a phone) and confirming the header stays inside the viewport.

The change is non-functional — no behavior, no state, no routing. Existing tests for the detail page (`edit-flow.test.tsx`, `pager.test.tsx`, `rating-cancel.test.tsx`, `user-switch.test.tsx`) continue to pass unchanged.

## Security & accessibility

- No new tab order changes — DOM order stays the same.
- Buttons remain visible and clickable in both layouts.
- No ARIA changes needed.
