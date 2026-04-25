# Apartment "Available From" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse and edit a per-apartment "available from" date — extracted from the listing PDF, stored as ISO `YYYY-MM-DD` text, displayed Swiss-style on the detail page, editable via the existing form.

**Architecture:** New `text` column `available_from` on the apartments table. Tiny helper module `src/lib/iso-date.ts` exports `isIsoDate` (validation guard) and `formatSwissDate` (display). AI extraction adds `availableFrom` to its schema and prompt. The form's `ApartmentForm` type gains the field as a string; routes validate on POST/PATCH; the detail page renders one new line in its summary and `<input type="date">` in its edit form.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle (SQLite), Vitest, `ai` SDK with Google Gemini.

**Spec:** [`docs/superpowers/specs/2026-04-25-available-from-design.md`](../specs/2026-04-25-available-from-design.md)
**Issue:** [#55](https://github.com/brlauuu/flatpare/issues/55)

---

## File Structure

### Files created

- `src/lib/iso-date.ts` — `isIsoDate` and `formatSwissDate` helpers.
- `src/lib/__tests__/iso-date.test.ts` — 5 unit tests.

### Files modified

- `src/lib/db/schema.ts` — add `availableFrom` column.
- `drizzle/<new>_*.sql` — generated migration.
- `src/lib/parse-pdf.ts` — extend the schema and prompt; passthrough only.
- `src/lib/__tests__/parse-pdf.test.ts` — extend with 5 new tests.
- `src/app/api/apartments/route.ts` — POST validates `availableFrom`; GET selects the column.
- `src/app/api/apartments/[id]/route.ts` — PATCH validates `availableFrom`.
- `src/components/apartment-form-fields.tsx` — extend `ApartmentForm` / helpers / form UI.
- `src/app/apartments/[id]/page.tsx` — extend `ApartmentDetail` type and render the date.
- `src/app/apartments/[id]/__tests__/edit-flow.test.tsx` — 2 new integration tests + fixture update.

---

## Task 1: `iso-date` helpers (TDD)

**Files:**
- Create: `src/lib/iso-date.ts`
- Create: `src/lib/__tests__/iso-date.test.ts`

### Step 1: Write the failing tests

Create `src/lib/__tests__/iso-date.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatSwissDate, isIsoDate } from "@/lib/iso-date";

describe("isIsoDate", () => {
  it("accepts a well-formed ISO date", () => {
    expect(isIsoDate("2026-05-01")).toBe(true);
  });

  it("rejects a Swiss-format date", () => {
    expect(isIsoDate("01.05.2026")).toBe(false);
  });

  it("rejects free text like 'ab sofort'", () => {
    expect(isIsoDate("ab sofort")).toBe(false);
  });
});

describe("formatSwissDate", () => {
  it("converts ISO YYYY-MM-DD to DD.MM.YYYY", () => {
    expect(formatSwissDate("2026-05-01")).toBe("01.05.2026");
  });

  it("preserves the digits exactly", () => {
    expect(formatSwissDate("2026-12-31")).toBe("31.12.2026");
  });
});
```

### Step 2: Run tests — should fail

Run: `npm test -- src/lib/__tests__/iso-date.test.ts`
Expected: 5 fail with `Cannot find module '@/lib/iso-date'`.

### Step 3: Implement

Create `src/lib/iso-date.ts`:

```ts
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

/**
 * Convert an ISO `YYYY-MM-DD` date string to Swiss `DD.MM.YYYY` format.
 * Caller must pass a string already validated with `isIsoDate`.
 */
export function formatSwissDate(iso: string): string {
  return iso.split("-").reverse().join(".");
}
```

### Step 4: Run tests — should pass

Run: `npm test -- src/lib/__tests__/iso-date.test.ts`
Expected: 5 pass.

### Step 5: Full suite + lint

Run: `npm test && npm run lint`
Expected: 224/224 (prior 219 + 5), lint clean.

### Step 6: Commit

```bash
git add src/lib/iso-date.ts src/lib/__tests__/iso-date.test.ts
git commit -m "feat: add iso-date helpers"
```

---

## Task 2: DB schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/<auto-named>.sql` (Drizzle generates)

### Step 1: Add the column

In `src/lib/db/schema.ts`, locate the `apartments` table definition. Add a new field BEFORE the `createdAt` line:

```ts
availableFrom: text("available_from"),
```

The full apartments table block (showing the new field in context) should look like:

```ts
export const apartments = sqliteTable("apartments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  sizeM2: real("size_m2"),
  numRooms: real("num_rooms"),
  numBathrooms: integer("num_bathrooms"),
  numBalconies: integer("num_balconies"),
  hasWashingMachine: integer("has_washing_machine", { mode: "boolean" }),
  rentChf: real("rent_chf"),
  distanceBikeMin: integer("distance_bike_min"),
  distanceTransitMin: integer("distance_transit_min"),
  pdfUrl: text("pdf_url"),
  listingUrl: text("listing_url"),
  shortCode: text("short_code").unique(),
  rawExtractedData: text("raw_extracted_data"),
  availableFrom: text("available_from"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});
```

(Leave existing fields untouched — only the one new line above `createdAt`.)

### Step 2: Generate the migration

Run: `npm run db:generate`
Expected: a new file appears under `drizzle/` named like `0001_*.sql` (or similar — Drizzle picks the next sequential number). The file contains an `ALTER TABLE apartments ADD COLUMN available_from TEXT;` statement.

If Drizzle prompts for a migration name, accept the default.

### Step 3: Apply the migration

Run: `npm run db:push`
Expected: confirms the schema is up to date or applies the column to the local SQLite DB.

If `db:push` is interactive and asks "do you want to apply this change?", answer yes / accept.

### Step 4: Verify nothing in the codebase still type-errors

Run: `npm run build`
Expected: build still succeeds. The TS type for the apartments table now includes `availableFrom`, but no consumer references it yet — fine.

### Step 5: Run tests + lint

Run: `npm test && npm run lint`
Expected: 224/224 pass, lint clean. (The schema change doesn't affect test behavior — existing tests don't query the column.)

### Step 6: Commit

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add available_from column to apartments"
```

---

## Task 3: AI extraction (TDD)

**Files:**
- Modify: `src/lib/parse-pdf.ts`
- Modify: `src/lib/__tests__/parse-pdf.test.ts`

### Step 1: Add failing tests

Append to `src/lib/__tests__/parse-pdf.test.ts`:

In the existing schema-validation `describe("apartmentExtractionSchema", ...)` block (near the top of the file), add three new test cases. These confirm the public schema accepts the new field:

```ts
  it("accepts a valid ISO availableFrom", () => {
    const result = apartmentExtractionSchema.parse({
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
      rentChf: null,
      listingUrl: null,
      availableFrom: "2026-05-01",
    });
    expect(result.availableFrom).toBe("2026-05-01");
  });

  it("accepts null availableFrom", () => {
    const result = apartmentExtractionSchema.parse({
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
      rentChf: null,
      listingUrl: null,
      availableFrom: null,
    });
    expect(result.availableFrom).toBeNull();
  });

  it("rejects a non-string availableFrom", () => {
    expect(() =>
      apartmentExtractionSchema.parse({
        name: "X",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
        listingUrl: null,
        availableFrom: 12345,
      })
    ).toThrow();
  });
```

Add a new `describe` block at the end of the file:

```ts
describe("extractApartmentData — availableFrom passthrough", () => {
  it("returns availableFrom from the AI output", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
        listingUrl: null,
        availableFrom: "2026-05-01",
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.availableFrom).toBe("2026-05-01");
  });

  it("returns null availableFrom from the AI output", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
        listingUrl: null,
        availableFrom: null,
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.availableFrom).toBeNull();
  });
});
```

### Step 2: Run tests to confirm they fail

Run: `npm test -- src/lib/__tests__/parse-pdf.test.ts`
Expected: 5 new tests fail (3 schema-level: `availableFrom` not in schema; 2 passthrough: result doesn't have the field). Existing 14 tests still pass.

### Step 3: Update the schema and prompt in `src/lib/parse-pdf.ts`

In `apartmentExtractionSchema` (the public schema), add the new field after `listingUrl`:

```ts
  listingUrl: z
    .string()
    .nullable()
    .describe(
      "Original listing URL from the document (e.g. immobilienscout24, wg-gesucht, homegate, etc.)"
    ),
  availableFrom: z
    .string()
    .nullable()
    .describe(
      "Move-in / availability date in ISO format YYYY-MM-DD if a specific date is given " +
        "(e.g. 'Bezugstermin: 01.05.2026' → '2026-05-01', '1. Mai 2026' → '2026-05-01'). " +
        "null if not mentioned, or if the listing says 'ab sofort' / 'per sofort' / 'immediately'."
    ),
});
```

Find the prompt text (the `text:` field inside the user message). Append a new line right before `Return null for any field you cannot determine from the document.`:

```
For availableFrom: parse Swiss / German / English availability phrases like "Bezugstermin: 01.05.2026", "verfügbar ab 1. Mai 2026", "available from May 1, 2026" into ISO format YYYY-MM-DD. If the listing says "ab sofort", "per sofort", "immediately", or similar (meaning available now without a specific date), return null. If no availability info is mentioned, return null.
```

### Step 4: Run tests to confirm they pass

Run: `npm test -- src/lib/__tests__/parse-pdf.test.ts`
Expected: 19 tests pass (14 existing + 5 new).

### Step 5: Full suite + lint

Run: `npm test && npm run lint`
Expected: 229/229 (224 + 5), lint clean.

### Step 6: Commit

```bash
git add src/lib/parse-pdf.ts src/lib/__tests__/parse-pdf.test.ts
git commit -m "feat: extract availableFrom from listing PDFs"
```

---

## Task 4: API routes

**Files:**
- Modify: `src/app/api/apartments/route.ts`
- Modify: `src/app/api/apartments/[id]/route.ts`

### Step 1: GET list — add `availableFrom` to the explicit field list

In `src/app/api/apartments/route.ts`, find the `db.select({...})` call inside the `GET` handler. Add `availableFrom` after `listingUrl`:

```ts
  pdfUrl: apartments.pdfUrl,
  listingUrl: apartments.listingUrl,
  availableFrom: apartments.availableFrom,
  shortCode: apartments.shortCode,
```

### Step 2: POST — validate and insert `availableFrom`

In `src/app/api/apartments/route.ts`, add an import:

```ts
import { isIsoDate } from "@/lib/iso-date";
```

Inside the `POST` handler, just before the `for (let attempt = ...)` loop (so the validation runs once, before any DB attempt), add:

```ts
const availableFrom: string | null =
  typeof body.availableFrom === "string" && isIsoDate(body.availableFrom)
    ? body.availableFrom
    : null;
```

Inside the `db.insert(apartments).values({...})` call, add `availableFrom` after `listingUrl`:

```ts
  listingUrl: body.listingUrl || null,
  availableFrom,
  shortCode,
```

### Step 3: PATCH — validate and update `availableFrom`

In `src/app/api/apartments/[id]/route.ts`, add an import:

```ts
import { isIsoDate } from "@/lib/iso-date";
```

Inside the `PATCH` handler, after `const body = await request.json();`, add:

```ts
const availableFrom: string | null =
  typeof body.availableFrom === "string" && isIsoDate(body.availableFrom)
    ? body.availableFrom
    : null;
```

Inside the `db.update(apartments).set({...})` call, add `availableFrom` after `listingUrl`:

```ts
  listingUrl: body.listingUrl,
  availableFrom,
})
```

### Step 4: Run tests + lint + build

Run: `npm test && npm run lint && npm run build`
Expected: 229 pass, lint clean, build clean. No tests directly cover these routes; the existing parse-pdf retry test mocks `/api/apartments` and `/api/apartments/{id}` requests at the page level.

### Step 5: Commit

```bash
git add src/app/api/apartments/route.ts src/app/api/apartments/[id]/route.ts
git commit -m "feat: API routes accept and return availableFrom"
```

---

## Task 5: Form types + UI + detail page + integration tests

**Files:**
- Modify: `src/components/apartment-form-fields.tsx`
- Modify: `src/app/apartments/[id]/page.tsx`
- Modify: `src/app/apartments/[id]/__tests__/edit-flow.test.tsx`

### Step 1: Extend `ApartmentForm` and helpers in `src/components/apartment-form-fields.tsx`

Add `availableFrom: string` to:

- `ApartmentForm` type (after `listingUrl`).
- `emptyApartmentForm` literal: `availableFrom: ""`.

In `formFromExtracted`, add (after `listingUrl`):

```ts
availableFrom:
  typeof extracted.availableFrom === "string" ? extracted.availableFrom : "",
```

Add `availableFrom: string | null` to the `ApartmentLike` type (after `listingUrl`).

In `formFromApartment`, add (after `listingUrl`):

```ts
availableFrom: apt.availableFrom ?? "",
```

In `formToPayload`, add (after `listingUrl`):

```ts
availableFrom: form.availableFrom || null,
```

### Step 2: Add the date input to `ApartmentFormFields`

Inside the `ApartmentFormFields` JSX, find the existing rent (CHF) input. Add a new field below it (or wherever the existing form layout fits — keep it near the other "primary listing facts" fields):

```tsx
<div className="space-y-1.5">
  <Label htmlFor={`${idPrefix}-availableFrom`}>Available from</Label>
  <Input
    id={`${idPrefix}-availableFrom`}
    type="date"
    value={form.availableFrom}
    onChange={(e) => onChange("availableFrom", e.target.value)}
  />
</div>
```

If the existing fields are arranged in a grid, add this one in the same grid; otherwise stack vertically. Match the existing field's wrapper structure.

### Step 3: Update `ApartmentDetail` type and render in `src/app/apartments/[id]/page.tsx`

Find the `interface ApartmentDetail { ... }` declaration. Add `availableFrom: string | null;` (after `listingUrl`).

Add an import at the top:

```tsx
import { formatSwissDate } from "@/lib/iso-date";
```

Find the read-only summary block on the detail page (the muted-text rows showing distance / size etc.). Add a new line that renders only when set:

```tsx
{apartment.availableFrom && (
  <div className="text-sm text-muted-foreground">
    Available from: {formatSwissDate(apartment.availableFrom)}
  </div>
)}
```

(Place it next to the other muted-text summary rows. Locate them by searching for `text-muted-foreground` near the apartment header.)

### Step 4: Update integration test fixture and add 2 new tests

In `src/app/apartments/[id]/__tests__/edit-flow.test.tsx`, find `APARTMENT_V1` and `APARTMENT_V2` constants. Add `availableFrom: "2026-05-01"` to V1 and `availableFrom: "2026-07-15"` to V2 (after `listingUrl` or at the end of each object).

After the existing 3 tests, before the closing `});` of the `describe("Apartment detail edit flow", ...)` block, add:

```tsx
it("displays availableFrom in Swiss format on the read-only view", async () => {
  render(<ApartmentDetailPage />);
  await waitFor(() => {
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
  });
  expect(screen.getByText(/01\.05\.2026/)).toBeInTheDocument();
});

it("round-trips the availableFrom date through the edit form", async () => {
  const user = userEvent.setup();
  render(<ApartmentDetailPage />);
  await waitFor(() => {
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: /^Edit$/ }));

  const dateInput = screen.getByLabelText(/Available from/i) as HTMLInputElement;
  expect(dateInput.value).toBe("2026-05-01");

  await user.clear(dateInput);
  await user.type(dateInput, "2026-07-15");

  await user.click(screen.getByRole("button", { name: /^Save$/ }));

  await waitFor(() => {
    const patchCall = fetchCalls.find(
      (c) => c.url.endsWith("/api/apartments/42") && c.init.method === "PATCH"
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall!.init.body as string) ?? "{}");
    expect(body.availableFrom).toBe("2026-07-15");
  });
});
```

Note: the 2nd new test ("round-trips") does multiple `userEvent` operations and may need the same `10000ms` timeout already applied to the existing "save flips name + rent + washing" test. Add the timeout in the same way:

```tsx
it(
  "round-trips the availableFrom date through the edit form",
  async () => {
    // body
  },
  10000
);
```

### Step 5: Run all tests

Run: `npm test`
Expected: 231 pass (229 + 2 new). The fixture update doesn't break the existing tests because they don't assert on `availableFrom`.

### Step 6: Run lint and build

Run: `npm run lint && npm run build`
Expected: clean.

### Step 7: Manual smoke-check

Skip — the user has explicitly opted into "merge on green local tests". The browser preview check is theirs to do.

### Step 8: Commit

```bash
git add src/components/apartment-form-fields.tsx \
        src/app/apartments/[id]/page.tsx \
        src/app/apartments/[id]/__tests__/edit-flow.test.tsx
git commit -m "feat: edit and display availableFrom on apartment detail (#55)"
```

---

## Task 6: Open PR

**Files:** none.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 55-available-from`
Expected: branch published.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: parse and edit available-from date (#55)" \
  --body "$(cat <<'EOF'
## Summary
- New `available_from` text column (ISO `YYYY-MM-DD`) on the apartments table; migration generated and applied via Drizzle.
- AI extraction adds `availableFrom` to its schema and prompt — handles "Bezugstermin: 01.05.2026", "1. Mai 2026", "available from May 1, 2026", etc. "ab sofort" / "per sofort" return null.
- POST and PATCH routes validate the input via a tiny `isIsoDate` helper; bad strings drop to null instead of poisoning the DB.
- Detail page shows `Available from: 01.05.2026` (Swiss format) when set; native `<input type="date">` in the edit form.
- List card and compare view unchanged.

## Test plan
- [x] `npm test` passes (5 helper tests + 5 schema/passthrough tests + 2 integration tests, 231 total)
- [x] `npm run lint` clean
- [x] `npm run build` succeeds
- [ ] Vercel preview: upload a listing with a date phrase, confirm extracted; edit on detail page; reload to confirm persistence.

Closes #55

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Hand back to controller.**

---

## Self-Review Checklist

**Spec coverage:**
- DB column `available_from` text nullable: Task 2 ✓
- Drizzle migration generated and applied: Task 2 Steps 2–3 ✓
- `isIsoDate` validator + `formatSwissDate` formatter in `src/lib/iso-date.ts`: Task 1 ✓
- Schema accepts `availableFrom: string | null` in public schema: Task 3 Step 3 ✓
- AI prompt parses date phrases: Task 3 Step 3 ✓
- POST and PATCH routes validate: Task 4 Steps 2–3 ✓
- GET list explicitly selects the column: Task 4 Step 1 ✓
- GET detail auto-includes (uses `select()`): Task 2 (schema change) ✓
- `ApartmentForm` / `formFromExtracted` / `ApartmentLike` / `formFromApartment` / `formToPayload` updated: Task 5 Step 1 ✓
- `<input type="date">` in form UI: Task 5 Step 2 ✓
- `ApartmentDetail` type + Swiss-format display: Task 5 Step 3 ✓
- 5 helper tests: Task 1 ✓
- 5 parse-pdf tests: Task 3 Step 1 ✓
- 2 integration tests: Task 5 Step 4 ✓
- List card / compare view UNTOUCHED: confirmed by absence of changes to `src/app/apartments/page.tsx`, `src/app/compare/page.tsx`, `src/lib/apartment-sort.ts` ✓

**Placeholder scan:** no TBDs, no generic phrases. Every code step shows complete code.

**Type consistency:**
- `availableFrom: string` on the form, `string | null` on the API and detail types. Consistent with existing nullable-DB-field pattern (e.g. `address`, `listingUrl`).
- `isIsoDate` and `formatSwissDate` both live in `src/lib/iso-date.ts`, both consumed by Tasks 4 and 5 respectively.
- The integration test fixture format (`"2026-05-01"`) matches what the form input produces and what the API stores.

No gaps.
