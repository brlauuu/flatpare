# Shared-laundry evidence override — design

**Issue:** [#53 — Parse "Waschküche und Trockenraum zur Mitbenutzung" or similar as no washing machine](https://github.com/brlauuu/flatpare/issues/53)
**Date:** 2026-04-25

## Problem

Swiss German rental listings frequently describe shared laundry rooms with phrases like "Waschküche und Trockenraum zur Mitbenutzung" or "Gemeinschaftswaschküche". The current AI prompt mentions `Waschküche` as a false-indicator for `hasWashingMachine`, but the AI sometimes still returns `true` or `null` when these phrases appear — likely confused by adjacent generic mentions of `Waschmaschine` elsewhere in the listing.

## Scope

- Tighten the prompt to call out "zur Mitbenutzung" and related phrases explicitly.
- Add an internal `laundryEvidence` field the AI populates with the exact snippet driving its decision.
- Apply a deterministic server-side override: if the cited evidence matches a known shared-laundry pattern, force `hasWashingMachine: false` regardless of what the AI returned.
- Strip `laundryEvidence` from the lib's public return — clients and the API response are unchanged.

## Schema split

Split the Zod schema into two:

- `internalApartmentExtractionSchema` — full schema including `laundryEvidence: string | null`. Used as the AI Output type inside `extractApartmentData`.
- `apartmentExtractionSchema` (existing, public) — omits `laundryEvidence`. The exported `ApartmentExtraction` type is unchanged, so the API route, the parse-pdf route response, and the upload UI all keep their current contracts.

## Prompt update

Replace the existing `hasWashingMachine` paragraph in the user message:

> For `hasWashingMachine`: **`true`** if the listing says the apartment has its own washing machine ("Waschmaschine in der Wohnung", "eigene Waschmaschine", "Waschturm", "own washing machine"). **`false`** if the listing describes shared / communal laundry — especially phrases like "zur Mitbenutzung", "zur Mitnutzung", "Gemeinschaftswaschküche", "Gemeinschaftswaschraum", "shared laundry", or "communal laundry". **`null`** if not mentioned.
>
> Always populate `laundryEvidence` with the exact short snippet you used to decide (max ~120 characters), or null if no laundry information was found.

The Zod field description on `laundryEvidence` mirrors this language so the model can use it as schema-time guidance.

## Deterministic override

After the AI returns its output, the lib applies a server-side check:

```ts
const SHARED_LAUNDRY_PATTERN =
  /zur\s+(mit)?nutzung|zur\s+mitbenutzung|gemeinschafts(wasch|wäsche)|shared\s+laundry|communal\s+laundry/i;

function overrideLaundryFromEvidence<T extends { laundryEvidence: string | null; hasWashingMachine: boolean | null }>(
  result: T,
): T {
  if (!result.laundryEvidence) return result;
  if (SHARED_LAUNDRY_PATTERN.test(result.laundryEvidence)) {
    return { ...result, hasWashingMachine: false };
  }
  return result;
}
```

### Behavior

| AI `hasWashingMachine` | Evidence matches shared pattern | Final value |
|------------------------|---------------------------------|-------------|
| `true`                 | yes                             | **`false`** (override) |
| `null`                 | yes                             | **`false`** (override) |
| `false`                | yes                             | `false` (no change)    |
| any                    | no                              | unchanged              |
| any                    | evidence is null                | unchanged              |

The override is narrow: it only triggers when the AI itself cited shared-laundry evidence. We don't run the regex against arbitrary text — we trust the AI's evidence-extraction step, then validate its conclusion.

### Why patterns

- `zur\s+(mit)?nutzung` covers "zur Mitnutzung" and "zur Nutzung".
- `zur\s+mitbenutzung` covers the headline phrase from the issue title.
- `gemeinschafts(wasch|wäsche)` covers "Gemeinschaftswaschküche", "Gemeinschaftswaschraum", "Gemeinschaftswäscherei".
- `shared\s+laundry` and `communal\s+laundry` cover the English variants.
- All patterns case-insensitive.

Out: `Waschküche im Keller` alone — that phrase by itself doesn't unambiguously mean shared (some listings use it to describe an in-unit basement laundry). We don't override on it.

## Stripping the internal field

`extractApartmentData` ends with:

```ts
const withOverride = overrideLaundryFromEvidence(internalResult);
const { laundryEvidence: _evidence, ...publicResult } = withOverride;
return publicResult as ApartmentExtraction;
```

The public type (`ApartmentExtraction`, derived from `apartmentExtractionSchema`) doesn't include `laundryEvidence`, so the cast is sound.

## Testing

### `src/lib/__tests__/parse-pdf.test.ts` (extend)

Existing 5 tests stay green — public schema is unchanged.

Add 5 new tests under a new `describe("extractApartmentData — laundry evidence override", ...)` block:

1. AI returns `hasWashingMachine: true` + evidence `"Waschküche zur Mitbenutzung"` → result has `false`, no `laundryEvidence` field.
2. AI returns `null` + evidence `"Waschküche und Trockenraum zur Mitbenutzung"` → result has `false`.
3. AI returns `true` + evidence `"eigene Waschmaschine"` → result has `true` (no override).
4. AI returns `false` + evidence `"Gemeinschaftswaschküche im Keller"` → result has `false` (no-op).
5. AI returns `true` + evidence `null` → result has `true` (no override possible; tests the early-return).

All 5 also assert `result` does not contain `laundryEvidence` (the field is stripped).

### No client-side test changes

The route response shape doesn't change. The upload page tests don't touch laundry detection.

## Out of scope

- Adding a PDF text-extraction library to do raw regex over the document.
- Translating the override to other heuristics (e.g. "mention of basement"). Keep it tight: only override when the AI's cited evidence is unambiguous.
- UI tweaks on the upload page or detail page. The result of the override is still a plain `boolean | null` for `hasWashingMachine`.
- Reporting which heuristic decided the value to the user.
