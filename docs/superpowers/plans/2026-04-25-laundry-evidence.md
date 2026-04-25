# Shared-Laundry Evidence Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force `hasWashingMachine: false` when the AI's cited evidence contains a known shared-laundry phrase ("zur Mitbenutzung", "Gemeinschaftswaschküche", etc.).

**Architecture:** Split the Zod schema into an internal one (with a new `laundryEvidence` field the AI populates) and a public one (unchanged shape). After the AI call, run a deterministic regex over the evidence; if it matches, override `hasWashingMachine: false`. Strip `laundryEvidence` before returning so the lib's public contract is unchanged.

**Tech Stack:** TypeScript, Vitest, `ai` SDK with Google Gemini, Zod.

**Spec:** [`docs/superpowers/specs/2026-04-25-laundry-evidence-design.md`](../specs/2026-04-25-laundry-evidence-design.md)
**Issue:** [#53](https://github.com/brlauuu/flatpare/issues/53)

---

## File Structure

### Files modified

- `src/lib/parse-pdf.ts` — split the schema, update the prompt, add the override + strip step.
- `src/lib/__tests__/parse-pdf.test.ts` — add 5 override tests in a new `describe` block. Existing 9 tests stay unchanged.

### No new files. No API, schema, or DB changes.

---

## Task 1: Schema split, prompt, override, tests

**Files:**
- Modify: `src/lib/parse-pdf.ts`
- Modify: `src/lib/__tests__/parse-pdf.test.ts`

### Step 1: Add the failing tests

Append a new `describe` block at the end of `src/lib/__tests__/parse-pdf.test.ts`, after the closing `});` of the existing `describe("extractApartmentData", ...)`:

```ts
describe("extractApartmentData — laundry evidence override", () => {
  it("overrides hasWashingMachine to false when evidence cites 'zur Mitbenutzung'", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: true,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: "Waschküche zur Mitbenutzung",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(false);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("overrides null hasWashingMachine to false on shared-laundry evidence", async () => {
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
        laundryEvidence: "Waschküche und Trockenraum zur Mitbenutzung",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(false);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("keeps hasWashingMachine=true when evidence describes in-unit laundry", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: true,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: "eigene Waschmaschine in der Wohnung",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(true);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("leaves hasWashingMachine=false unchanged when evidence is shared (no-op override)", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: false,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: "Gemeinschaftswaschküche im Keller",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(false);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("does not override when laundryEvidence is null", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: true,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(true);
    expect("laundryEvidence" in result).toBe(false);
  });
});
```

### Step 2: Run tests to confirm they fail

Run: `npm test -- src/lib/__tests__/parse-pdf.test.ts`
Expected: 5 new tests fail (no override yet — `result.hasWashingMachine` stays as the AI returned it; `laundryEvidence` stays in the result). Existing 9 tests still pass.

### Step 3: Update `src/lib/parse-pdf.ts`

Replace the contents of the file with:

```ts
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";

export const apartmentExtractionSchema = z.object({
  name: z.string().describe("Listing title or apartment name"),
  address: z.string().nullable().describe("Full street address with postcode"),
  sizeM2: z
    .number()
    .nullable()
    .describe("Living area in square meters"),
  numRooms: z
    .number()
    .nullable()
    .describe("Number of rooms (Swiss style, e.g. 3.5)"),
  numBathrooms: z
    .number()
    .nullable()
    .describe("Number of bathrooms"),
  numBalconies: z
    .number()
    .nullable()
    .describe("Number of balconies or terraces"),
  hasWashingMachine: z
    .boolean()
    .nullable()
    .describe(
      "Whether the apartment has its own washing machine. " +
        "true if explicitly mentioned as in-unit / private (e.g. 'Waschmaschine in der Wohnung', 'eigene Waschmaschine', 'Waschturm', 'own washing machine'). " +
        "false if the listing describes shared / communal laundry — including phrases like 'zur Mitbenutzung', 'zur Mitnutzung', 'Gemeinschaftswaschküche', 'Gemeinschaftswaschraum', 'shared laundry', or 'communal laundry'. " +
        "null if not mentioned."
    ),
  rentChf: z
    .number()
    .nullable()
    .describe("Monthly rent in CHF (gross/brutto if available)"),
  listingUrl: z
    .string()
    .nullable()
    .describe(
      "Original listing URL from the document (e.g. immobilienscout24, wg-gesucht, homegate, etc.)"
    ),
});

export type ApartmentExtraction = z.infer<typeof apartmentExtractionSchema>;

const internalApartmentExtractionSchema = apartmentExtractionSchema.extend({
  laundryEvidence: z
    .string()
    .nullable()
    .describe(
      "If laundry information was found, the exact short snippet from the listing " +
        "that supports the hasWashingMachine value (max ~120 chars). null if not mentioned. " +
        "Examples: 'Waschküche und Trockenraum zur Mitbenutzung', 'eigene Waschmaschine in der Wohnung'."
    ),
});

type InternalApartmentExtraction = z.infer<typeof internalApartmentExtractionSchema>;

const SHARED_LAUNDRY_PATTERN =
  /zur\s+(mit)?nutzung|zur\s+mitbenutzung|gemeinschafts(wasch|wäsche)|shared\s+laundry|communal\s+laundry/i;

function overrideLaundryFromEvidence(
  result: InternalApartmentExtraction
): InternalApartmentExtraction {
  if (!result.laundryEvidence) return result;
  if (SHARED_LAUNDRY_PATTERN.test(result.laundryEvidence)) {
    return { ...result, hasWashingMachine: false };
  }
  return result;
}

function getModel() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      model: google("gemini-2.5-flash"),
      service: "gemini" as const,
    };
  }

  throw new Error("No AI provider configured");
}

export async function extractApartmentData(
  pdfBase64: string
): Promise<ApartmentExtraction> {
  const { model, service } = getModel();

  const result = await generateText({
    model,
    output: Output.object({
      schema: internalApartmentExtractionSchema,
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an apartment listing data extractor. Extract structured data from this apartment listing PDF.
The listing may be in German or English. Extract all available information.
For rent, prefer the gross/brutto rent (Bruttomiete) if both net and gross are shown.
For rooms, use the Swiss convention (e.g. 3.5 Zimmer = 3.5 rooms).
For hasWashingMachine: true if the listing says the apartment has its own washing machine ("Waschmaschine in der Wohnung", "eigene Waschmaschine", "Waschturm", "own washing machine"). false if the listing describes shared / communal laundry — especially phrases like "zur Mitbenutzung", "zur Mitnutzung", "Gemeinschaftswaschküche", "Gemeinschaftswaschraum", "shared laundry", or "communal laundry". null if not mentioned.
Always populate laundryEvidence with the exact short snippet (max ~120 characters) you used to decide, or null if no laundry information was found.
Return null for any field you cannot determine from the document.`,
          },
          {
            type: "file",
            data: pdfBase64,
            mediaType: "application/pdf",
          },
        ],
      },
    ],
  });

  // Log token usage
  try {
    await db.insert(apiUsage).values({
      service,
      operation: "parse_pdf",
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    });
  } catch {
    // Don't fail the parse if logging fails
  }

  if (!result.output) {
    throw new Error("Failed to extract apartment data from PDF");
  }

  const internal = result.output as InternalApartmentExtraction;
  const withOverride = overrideLaundryFromEvidence(internal);
  // Strip the internal-only field before returning to public callers.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { laundryEvidence: _evidence, ...publicResult } = withOverride;
  return publicResult as ApartmentExtraction;
}
```

### Step 4: Run the tests — should pass

Run: `npm test -- src/lib/__tests__/parse-pdf.test.ts`
Expected: 14 tests pass (9 existing + 5 new).

### Step 5: Run the full suite and lint

Run: `npm test && npm run lint`
Expected: all tests pass (219 total = prior 214 + 5 new), lint clean.

### Step 6: Run the build

Run: `npm run build`
Expected: build succeeds, no TS errors.

### Step 7: Commit

```bash
git add src/lib/parse-pdf.ts src/lib/__tests__/parse-pdf.test.ts
git commit -m "feat: override hasWashingMachine on shared-laundry evidence (#53)"
```

---

## Task 2: Open PR

**Files:** none.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 53-laundry-evidence`
Expected: branch published.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: override hasWashingMachine on shared-laundry evidence (#53)" \
  --body "$(cat <<'EOF'
## Summary
- Split the AI extraction schema into an internal one (with a new `laundryEvidence` snippet field) and a public one (unchanged shape).
- Strengthened the prompt to call out "zur Mitbenutzung", "Gemeinschaftswaschküche", etc., and to always cite evidence.
- Server-side override: if the AI's cited evidence matches a known shared-laundry pattern, force `hasWashingMachine: false` regardless of what the AI returned.
- `laundryEvidence` is stripped before the lib returns; the route response and the upload UI are unchanged.

## Test plan
- [x] `npm test` passes (5 new override tests, 219 total)
- [x] `npm run lint` clean
- [x] `npm run build` succeeds
- [ ] Vercel preview: re-upload a PDF that previously mis-detected (containing "Waschküche … zur Mitbenutzung") and confirm `hasWashingMachine` is now `false`.

Closes #53

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Hand back to the controller.**

---

## Self-Review Checklist

**Spec coverage:**
- Schema split (internal vs public): Task 1 Step 3 ✓
- Public `ApartmentExtraction` type unchanged: Task 1 Step 3 (declared from `apartmentExtractionSchema` which doesn't include `laundryEvidence`) ✓
- Prompt strengthened with "zur Mitbenutzung" etc.: Task 1 Step 3 ✓
- Override function with the documented truth table: Task 1 Step 3 ✓
- Strip step before return: Task 1 Step 3 ✓
- 5 override tests: Task 1 Step 1 ✓
- Existing 9 parse-pdf tests stay green (their mocks don't include `laundryEvidence`, the lib's strip step destructures `undefined` safely): verified by Task 1 Step 5 (`npm test`) ✓

**Placeholder scan:** no TBDs, no generic phrases. Every code step shows complete code.

**Type consistency:**
- `apartmentExtractionSchema` / `ApartmentExtraction` (public) used in callers, return type of `extractApartmentData`.
- `internalApartmentExtractionSchema` / `InternalApartmentExtraction` used inside the lib for AI Output and the override function.
- `SHARED_LAUNDRY_PATTERN` defined once, used in `overrideLaundryFromEvidence`.
- The override function takes / returns `InternalApartmentExtraction`; the destructure happens after.

No gaps.
