# Parse-PDF error reporting & retry — design

**Issue:** [#66 — Better error reporting and retry for PDF parse failures](https://github.com/brlauuu/flatpare/issues/66)
**Date:** 2026-04-24

## Problem

When a PDF upload hits the Google AI quota (or any other server-side parse failure), the upload item at `/apartments/new` lands in `status: "error"` with a raw, unclassified message. The user must remove the item and re-pick the same file to try again. There's no indication of *why* it failed or *when* it might work.

## Scope

- Classify parse-pdf errors server-side into three buckets: `quota`, `invalid_pdf`, `unknown`.
- Return a structured error body so the client can surface actionable messages — including a suggested wait time when the API leaks one.
- Add a Retry button on every errored item in the upload UI; no auto-retry (per user preference).
- Preserve the original `File` across retries via a `useRef`-backed `Map`.

## Error classification

New helper: `classifyParsePdfError(err: unknown): { reason, message, retryAfterSeconds?, status }` in `src/lib/parse-pdf-error.ts`.

### Inputs & outputs

```ts
export type ParsePdfErrorReason = "quota" | "invalid_pdf" | "unknown";

export interface ClassifiedParsePdfError {
  reason: ParsePdfErrorReason;
  message: string;
  retryAfterSeconds?: number;
  status: number;
}
```

### Classification rules

- **`quota`** (status `429`): upstream error status is `429`, OR message matches `/quota|rate limit|too many requests|retry after/i`. Tries to parse a retry hint:
  - `retry after (\d+)s?` / `retry after (\d+) seconds` → seconds
  - `retry in (\d+)\s*m(?:in)?` → minutes × 60
  - `retry in (\d+)\s*h` → hours × 3600 (capped)
  - Result range clamped to `[1, 3600]`. If no match, `retryAfterSeconds` is `undefined`.
- **`invalid_pdf`** (status `400`): message matches `/invalid|corrupt|unsupported|exceeded.*token/i` (AND not already classified as `quota`).
- **`unknown`** (status `500`): everything else, including `Error` instances with empty messages.

### Human-readable messages

- Quota with seconds: `"AI quota exceeded — try again in {N}s."` (N rendered as `s` for <60, or `{floor(N/60)}m {N%60}s` for ≥60).
- Quota without seconds: `"AI quota exceeded — try again shortly."`
- Invalid PDF: `"Couldn't read this PDF. It may be corrupted or an unsupported format."`
- Unknown: `"Parsing failed: {original message}"` (falls back to `"Parsing failed."` when the original is empty).

## Server route changes

`src/app/api/parse-pdf/route.ts` catch block:

```ts
} catch (error) {
  console.error("[parse-pdf] Error:", error);
  const classified = classifyParsePdfError(error);
  return NextResponse.json(
    {
      error: classified.message,
      reason: classified.reason,
      retryAfterSeconds: classified.retryAfterSeconds,
    },
    { status: classified.status }
  );
}
```

The response shape becomes consistent: `{ error, reason, retryAfterSeconds? }`. Success responses are unchanged.

## Client UI changes

In `src/app/apartments/new/page.tsx`:

### Item type extension

```ts
interface Item {
  id: string;
  // ...existing fields...
  error?: string;
  errorReason?: ParsePdfErrorReason;
  errorRetryAfterSeconds?: number;
}
```

### File map (for retry)

A module-local `Map<string, File>` held in a `useRef`:

```tsx
const fileMapRef = useRef<Map<string, File>>(new Map());
```

- Populated by `processFiles` when each item is created.
- Read by `retryItem` to re-submit the PDF.
- Entries deleted when an item is saved (in `handleSaveAll` success path) or discarded.

### `parseOne(itemId, file)` extraction

The body of the existing per-file loop in `processFiles` moves into a new module-local function `parseOne(itemId, file)` that handles fetch + state transitions for one file. `processFiles` becomes a loop that iterates files and calls `parseOne`. `retryItem` also calls `parseOne` — shared implementation.

### Error branch in `parseOne`

```ts
if (!res.ok) {
  const data = (await res.json()) as {
    error?: string;
    reason?: ParsePdfErrorReason;
    retryAfterSeconds?: number;
  };
  setItems((prev) =>
    prev.map((i) =>
      i.id === itemId
        ? {
            ...i,
            status: "error",
            error: data.error ?? "Parsing failed",
            errorReason: data.reason ?? "unknown",
            errorRetryAfterSeconds: data.retryAfterSeconds,
          }
        : i
    )
  );
  return;
}
```

### Retry handler

```ts
async function retryItem(itemId: string) {
  const file = fileMapRef.current.get(itemId);
  if (!file) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, status: "error", error: "File reference lost — please re-upload" }
          : i
      )
    );
    return;
  }
  setItems((prev) =>
    prev.map((i) =>
      i.id === itemId
        ? {
            ...i,
            status: "uploading",
            error: undefined,
            errorReason: undefined,
            errorRetryAfterSeconds: undefined,
          }
        : i
    )
  );
  await parseOne(itemId, file);
}
```

### Retry button in JSX

In the error rendering block for an item:

```tsx
{item.status === "error" && (
  <div className="flex items-center gap-2">
    <p className="text-sm text-destructive">{item.error}</p>
    <Button
      variant="outline"
      size="sm"
      onClick={() => retryItem(item.id)}
    >
      Retry
    </Button>
  </div>
)}
```

(Exact layout stays consistent with the rest of the card — this is the shape, not necessarily the final class list.)

No auto-retry. No countdown. The message already mentions the wait time; the user clicks Retry when ready.

## No changes to

- `uploadFile` (blob storage).
- `extractApartmentData` (the AI call itself).
- Successful upload path.
- Any other page or route.

## Testing

### Unit tests — `src/lib/__tests__/parse-pdf-error.test.ts` (new file)

Eight cases covering the classifier:

1. 429 status → `reason: "quota"`.
2. `"retry after 34 seconds"` → `quota`, `retryAfterSeconds: 34`.
3. `"retry in 2m"` → `quota`, `retryAfterSeconds: 120`.
4. `"Quota exceeded"` (no numeric hint) → `quota`, `retryAfterSeconds: undefined`.
5. `"Invalid PDF structure"` → `invalid_pdf`.
6. `"Token limit exceeded"` → `invalid_pdf`.
7. `"ECONNRESET"` → `unknown`.
8. `new Error()` → `unknown` with a fallback message.

### Integration tests — `src/app/apartments/new/__tests__/retry.test.tsx` (new file)

Four cases:

1. **Quota error renders the parsed message and a Retry button.** First fetch mock returns 429 with the classified body. After drop + parse, the item is in error state with the message and Retry button.
2. **Clicking Retry re-submits the same file and transitions to done.** Second fetch returns `ok: true` with extracted data. After click, the item becomes reviewable. Assert the second call's FormData has the same filename.
3. **Invalid-PDF error also shows the Retry button.** First fetch 400 with `reason: "invalid_pdf"`. Retry button is present.
4. **Unknown error shows the Retry button.** 500 with `reason: "unknown"`. Retry present.

No changes to existing `edit-flow.test.tsx`, `rating-cancel.test.tsx`, `pager.test.tsx`, or the apartments-list test file. Those exercises the detail page / list / compare, which aren't touched here.

## Out of scope

- Auto-retry after the suggested wait.
- Visible countdown timer.
- Retry-all button for batch uploads.
- Parsing the `Retry-After` HTTP header (we parse the error message body instead; the AI SDK doesn't always surface the header).
- Persistent retry state across page reloads.
- Multiple retries with exponential backoff.

## Security note

No user-provided content flows into the error classifier beyond the error's `.message`. The regex patterns are not sensitive to injection: they're run against the upstream AI SDK's error text, not user input.
