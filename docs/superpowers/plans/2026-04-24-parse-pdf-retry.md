# Parse-PDF Error Reporting & Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify parse-pdf failures (quota / invalid PDF / unknown), surface actionable messages to the upload UI, and add a Retry button that resubmits the original file without the user re-picking it.

**Architecture:** A pure classifier helper in `src/lib/parse-pdf-error.ts` maps upstream errors to `{ reason, message, retryAfterSeconds?, status }`. The `/api/parse-pdf` route uses it in its catch block. The upload page adds a `useRef`-backed `Map<string, File>` so a retry handler can resubmit the same file; the per-file parse + distance logic is extracted into a helper function shared by the initial upload loop and the retry button.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + React Testing Library, Tailwind, shadcn/ui Button.

**Spec:** [`docs/superpowers/specs/2026-04-24-parse-pdf-retry-design.md`](../specs/2026-04-24-parse-pdf-retry-design.md)
**Issue:** [#66](https://github.com/brlauuu/flatpare/issues/66)

---

## File Structure

### Files created

- `src/lib/parse-pdf-error.ts` — pure classifier.
- `src/lib/__tests__/parse-pdf-error.test.ts` — 8 unit tests.
- `src/app/apartments/new/__tests__/retry.test.tsx` — 4 integration tests.

### Files modified

- `src/app/api/parse-pdf/route.ts` — catch block uses the classifier.
- `src/app/apartments/new/page.tsx` — `UploadItem` type extension; `fileMapRef`; extract `parseOne`; add `retryItem`; add Retry button JSX on the error state.

### No schema, env, or storage changes.

---

## Task 1: Pure classifier with unit tests (TDD)

**Files:**
- Create: `src/lib/parse-pdf-error.ts`
- Create: `src/lib/__tests__/parse-pdf-error.test.ts`

- [ ] **Step 1: Write the 8 failing tests**

Create `src/lib/__tests__/parse-pdf-error.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";

describe("classifyParsePdfError", () => {
  it("classifies an error with status 429 as quota", () => {
    const err = Object.assign(new Error("Rate limited"), {
      status: 429,
      statusCode: 429,
    });
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.status).toBe(429);
  });

  it("parses 'retry after 34 seconds' from the message", () => {
    const err = new Error(
      "You exceeded your current quota, please retry after 34 seconds"
    );
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.retryAfterSeconds).toBe(34);
    expect(result.message).toContain("34s");
  });

  it("parses 'retry in 2m' as 120 seconds", () => {
    const err = new Error("Rate limit exceeded. Please retry in 2m.");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.retryAfterSeconds).toBe(120);
    expect(result.message).toMatch(/2m/);
  });

  it("classifies a quota message with no numeric hint and leaves retryAfter undefined", () => {
    const err = new Error("Quota exceeded for this project.");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("quota");
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(result.message).toMatch(/shortly/i);
  });

  it("classifies 'Invalid PDF structure' as invalid_pdf", () => {
    const err = new Error("Invalid PDF structure");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("invalid_pdf");
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/couldn't read|corrupted|unsupported/i);
  });

  it("classifies 'Token limit exceeded' as invalid_pdf", () => {
    const err = new Error("Token limit exceeded for this request");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("invalid_pdf");
  });

  it("classifies 'ECONNRESET' as unknown with status 500", () => {
    const err = new Error("ECONNRESET");
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("unknown");
    expect(result.status).toBe(500);
    expect(result.message).toMatch(/ECONNRESET/);
  });

  it("falls back to a generic message for an Error with no message", () => {
    const err = new Error();
    const result = classifyParsePdfError(err);
    expect(result.reason).toBe("unknown");
    expect(result.message).toBe("Parsing failed.");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- src/lib/__tests__/parse-pdf-error.test.ts`
Expected: all 8 fail — `Cannot find module '@/lib/parse-pdf-error'`.

- [ ] **Step 3: Implement the classifier**

Create `src/lib/parse-pdf-error.ts`:

```ts
export type ParsePdfErrorReason = "quota" | "invalid_pdf" | "unknown";

export interface ClassifiedParsePdfError {
  reason: ParsePdfErrorReason;
  message: string;
  retryAfterSeconds?: number;
  status: number;
}

const QUOTA_PATTERN = /quota|rate limit|too many requests|retry after/i;
const INVALID_PDF_PATTERN = /invalid|corrupt|unsupported|exceeded.*token|token.*exceed/i;

function extractRetryAfterSeconds(message: string): number | undefined {
  const seconds = message.match(/retry (?:after|in) (\d+)\s*(?:s|sec|seconds)\b/i);
  if (seconds) return clamp(parseInt(seconds[1], 10));

  const minutes = message.match(/retry (?:after|in) (\d+)\s*m(?:in(?:ute)?s?)?\b/i);
  if (minutes) return clamp(parseInt(minutes[1], 10) * 60);

  const hours = message.match(/retry (?:after|in) (\d+)\s*h(?:ours?)?\b/i);
  if (hours) return clamp(parseInt(hours[1], 10) * 3600);

  // Bare number (no unit) immediately after "retry after" defaults to seconds.
  const bare = message.match(/retry (?:after|in) (\d+)\b/i);
  if (bare) return clamp(parseInt(bare[1], 10));

  return undefined;
}

function clamp(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 3600) return 3600;
  return n;
}

function formatQuotaMessage(retryAfter: number | undefined): string {
  if (retryAfter === undefined) {
    return "AI quota exceeded — try again shortly.";
  }
  if (retryAfter < 60) {
    return `AI quota exceeded — try again in ${retryAfter}s.`;
  }
  const m = Math.floor(retryAfter / 60);
  const s = retryAfter % 60;
  return s === 0
    ? `AI quota exceeded — try again in ${m}m.`
    : `AI quota exceeded — try again in ${m}m ${s}s.`;
}

function getStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.statusCode === "number") return e.statusCode;
  }
  return undefined;
}

export function classifyParsePdfError(err: unknown): ClassifiedParsePdfError {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const status = getStatus(err);

  const isQuota = status === 429 || QUOTA_PATTERN.test(message);
  if (isQuota) {
    const retryAfterSeconds = extractRetryAfterSeconds(message);
    return {
      reason: "quota",
      message: formatQuotaMessage(retryAfterSeconds),
      retryAfterSeconds,
      status: 429,
    };
  }

  if (INVALID_PDF_PATTERN.test(message)) {
    return {
      reason: "invalid_pdf",
      message: "Couldn't read this PDF. It may be corrupted or an unsupported format.",
      status: 400,
    };
  }

  return {
    reason: "unknown",
    message: message ? `Parsing failed: ${message}` : "Parsing failed.",
    status: 500,
  };
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `npm test -- src/lib/__tests__/parse-pdf-error.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Full suite + lint**

Run: `npm test && npm run lint`
Expected: all tests pass (204 total = prior 196 + 8 new), lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/parse-pdf-error.ts src/lib/__tests__/parse-pdf-error.test.ts
git commit -m "feat: add parse-pdf error classifier"
```

---

## Task 2: Wire the classifier into the route

**Files:**
- Modify: `src/app/api/parse-pdf/route.ts`

- [ ] **Step 1: Update the catch block**

Open `src/app/api/parse-pdf/route.ts`. The current catch block returns a raw `{ error: ... }` with status 500. Replace it to call the classifier and return a structured body plus an appropriate status:

Find:

```ts
} catch (error) {
  console.error("[parse-pdf] Error:", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to process PDF" },
    { status: 500 }
  );
}
```

Replace with:

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

Add an import at the top of the file, below the existing imports:

```ts
import { classifyParsePdfError } from "@/lib/parse-pdf-error";
```

- [ ] **Step 2: Full suite + lint**

Run: `npm test && npm run lint`
Expected: still 204 tests pass, lint clean (no test covers the route directly; the client tests in Task 3 will exercise this end-to-end via a mocked fetch).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/parse-pdf/route.ts
git commit -m "feat: parse-pdf route returns classified error responses"
```

---

## Task 3: Client retry UI + integration tests

This is the largest task. It touches one page file and adds one integration test file.

**Files:**
- Modify: `src/app/apartments/new/page.tsx`
- Create: `src/app/apartments/new/__tests__/retry.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Create `src/app/apartments/new/__tests__/retry.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

import UploadPage from "../page";

function makePdfFile(name = "listing.pdf"): File {
  const blob = new Blob(["%PDF-1.4\n...\n"], { type: "application/pdf" });
  return new File([blob], name, { type: "application/pdf" });
}

function successResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        pdfUrl: "https://blob.example/listing.pdf",
        extracted: {
          name: "Parsed Apartment",
          address: null,
          sizeM2: null,
          numRooms: null,
          numBathrooms: null,
          numBalconies: null,
          hasWashingMachine: null,
          rentChf: null,
          listingUrl: null,
        },
        aiAvailable: true,
      }),
  } as Response;
}

function errorResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

async function dropPdf(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  await user.upload(input, file);
}

beforeEach(() => {
  pushMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Upload page — retry", () => {
  it("renders a Retry button and the parsed message on a quota error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      errorResponse(429, {
        error: "AI quota exceeded — try again in 34s.",
        reason: "quota",
        retryAfterSeconds: 34,
      })
    );
    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await waitFor(() => {
      expect(screen.getByText(/AI quota exceeded.*34s/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeEnabled();
  });

  it("re-submits the same file on Retry and transitions to done", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        errorResponse(429, {
          error: "AI quota exceeded — try again in 34s.",
          reason: "quota",
          retryAfterSeconds: 34,
        })
      )
      .mockResolvedValueOnce(successResponse());
    render(<UploadPage />);
    await dropPdf(user, makePdfFile("listing.pdf"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => {
      expect(screen.getByText("Parsed Apartment")).toBeInTheDocument();
    });
    // First call = initial upload, second call = retry.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retryCall = fetchSpy.mock.calls[1];
    expect(retryCall[0]).toBe("/api/parse-pdf");
    const body = retryCall[1]?.body as FormData;
    expect((body.get("file") as File).name).toBe("listing.pdf");
  });

  it("shows the Retry button on an invalid_pdf error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      errorResponse(400, {
        error:
          "Couldn't read this PDF. It may be corrupted or an unsupported format.",
        reason: "invalid_pdf",
      })
    );
    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await waitFor(() => {
      expect(screen.getByText(/Couldn't read this PDF/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeEnabled();
  });

  it("shows the Retry button on an unknown error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      errorResponse(500, {
        error: "Parsing failed: ECONNRESET",
        reason: "unknown",
      })
    );
    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await waitFor(() => {
      expect(screen.getByText(/Parsing failed.*ECONNRESET/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- src/app/apartments/new/__tests__/retry.test.tsx`
Expected: 4 tests fail — no Retry button exists yet; second test also fails because the second fetch is never made.

- [ ] **Step 3: Extend `UploadItem` and add the file-map ref**

Open `src/app/apartments/new/page.tsx`. Extend the `UploadItem` type:

```ts
type UploadItem = {
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "parsing_distance" | "done" | "error";
  error?: string;
  errorReason?: "quota" | "invalid_pdf" | "unknown";
  errorRetryAfterSeconds?: number;
  form: ApartmentForm;
  expanded: boolean;
  saved: boolean;
  discarded: boolean;
};
```

Near the existing `const processingRef = useRef(false);` line (around line 50), add:

```ts
const fileMapRef = useRef<Map<string, File>>(new Map());
```

- [ ] **Step 4: Populate the file map when creating items**

In `processFiles`, find the block that creates `newItems` (around line 75) and the subsequent `setItems(newItems); setStep("processing"); ...`. Immediately after the `newItems` array is created, populate the file map in parallel:

```ts
const newItems: UploadItem[] = pdfFiles.map((file) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  fileName: file.name,
  status: "queued" as const,
  form: emptyApartmentForm,
  expanded: false,
  saved: false,
  discarded: false,
}));

// Remember the original File objects for retry.
pdfFiles.forEach((file, i) => {
  fileMapRef.current.set(newItems[i].id, file);
});
```

- [ ] **Step 5: Extract the per-file parse loop into `parseOne`**

Still in `processFiles`, the for-loop currently does fetch → state transitions → distance call for each file. Extract that body into a `parseOne(itemId, file)` function, inside the component (so it can close over `setItems`). Add it below `fileMapRef` and above `processFiles`:

```ts
async function parseOne(itemId: string, file: File) {
  setItems((prev) =>
    prev.map((item) =>
      item.id === itemId ? { ...item, status: "uploading" } : item
    )
  );

  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/parse-pdf", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const data = (await res.json()) as {
        error?: string;
        reason?: "quota" | "invalid_pdf" | "unknown";
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

    const { pdfUrl, extracted } = await res.json();
    const form = formFromExtracted(extracted, pdfUrl);

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, status: "parsing_distance", form }
          : item
      )
    );

    if (extracted.address) {
      try {
        const distRes = await fetch("/api/distance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: extracted.address }),
        });
        const dist = await distRes.json();
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: "done",
                  form: {
                    ...item.form,
                    distanceBikeMin:
                      dist.bikeMinutes?.toString() || "",
                    distanceTransitMin:
                      dist.transitMinutes?.toString() || "",
                  },
                }
              : item
          )
        );
      } catch {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, status: "done" } : item
          )
        );
      }
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, status: "done" } : item
        )
      );
    }
  } catch (err) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "error",
              error: err instanceof Error ? err.message : "Failed",
              errorReason: "unknown",
            }
          : item
      )
    );
  }
}
```

Replace the body of the for-loop inside `processFiles` (everything inside the `try { ... } catch (err) { ... }` block for one file, as well as the initial `setItems(...)` that sets the item to `"uploading"`) with a single call:

```ts
for (let i = 0; i < pdfFiles.length; i++) {
  if (!processingRef.current) break;
  const file = pdfFiles[i];
  const itemId = newItems[i].id;
  await parseOne(itemId, file);
}
```

The `setStep("review")` call after the loop stays as it was.

- [ ] **Step 6: Add the `retryItem` handler**

Below `parseOne`, add:

```ts
async function retryItem(itemId: string) {
  const file = fileMapRef.current.get(itemId);
  if (!file) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              status: "error",
              error: "File reference lost — please re-upload",
              errorReason: "unknown",
              errorRetryAfterSeconds: undefined,
            }
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

- [ ] **Step 7: Add the Retry button to the error UI**

Find where each item renders its error state. Grep for `"status: \"error\""` or the existing error display in `src/app/apartments/new/page.tsx` — it's a block rendered when `item.status === "error"`. Locate the place that shows `item.error` text. Add a Retry button next to it.

Run this to find the right spot:

```bash
grep -n "status === \"error\"\|item.error" src/app/apartments/new/page.tsx
```

Inside the error rendering block (inside the item's card), next to where `item.error` is rendered, add:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => retryItem(item.id)}
>
  Retry
</Button>
```

The exact JSX shape depends on the current layout. The goal is: the error message and the Retry button appear together in the same row or stacked tightly, so the user sees both at once. Reuse the existing error row's flex layout if present, or wrap the error text + button in a `<div className="flex items-center gap-2">`.

Do NOT change any other error text or layout. The error message comes straight from the server (already formatted by the classifier).

- [ ] **Step 8: Clean up the file map on save / discard**

Find `handleSaveAll` (the function that saves items to the DB). In its success-path loop that marks items as `saved: true`, add a `fileMapRef.current.delete(item.id)` call after each successful save.

Find any "discard" action (grep for `discarded: true`). Add the same `fileMapRef.current.delete(item.id)` there.

These deletions are best-effort hygiene — they keep memory clean across many batches on one page visit. Leaking File refs isn't a correctness issue; this is cleanup.

- [ ] **Step 9: Run the new integration tests — should pass**

Run: `npm test -- src/app/apartments/new/__tests__/retry.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 10: Full suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (208 total = prior 196 + 8 + 4 new), lint clean.

- [ ] **Step 11: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 12: Commit**

```bash
git add src/app/apartments/new/page.tsx src/app/apartments/new/__tests__/retry.test.tsx
git commit -m "feat: add retry button to failed PDF uploads (#66)"
```

---

## Task 4: Open PR

**Files:** none — workflow only.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 66-parse-pdf-retry`
Expected: branch published.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: parse-pdf error reporting + retry (#66)" \
  --body "$(cat <<'EOF'
## Summary
- New \`classifyParsePdfError\` helper classifies parse failures into \`quota\` / \`invalid_pdf\` / \`unknown\` and extracts "retry after Xs/Xm" hints from provider error messages.
- \`/api/parse-pdf\` now returns \`{ error, reason, retryAfterSeconds? }\` with an appropriate HTTP status (\`429\` for quota, \`400\` for invalid PDF, \`500\` otherwise).
- Upload UI shows a Retry button on every errored item. Retries resubmit the original File via a \`useRef\`-backed Map — no re-picking needed.
- No auto-retry; the user clicks Retry when they're ready.

## Test plan
- [x] \`npm test\` passes (8 classifier unit tests + 4 integration tests, 208 total)
- [x] \`npm run lint\` clean
- [x] \`npm run build\` succeeds
- [ ] Vercel preview: upload a PDF, trigger a quota error (if feasible) or force one via env, verify the message and Retry flow; also upload a non-PDF or malformed file to see the invalid_pdf branch.

Closes #66

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Hand back to the controller.**

---

## Self-Review Checklist

**Spec coverage:**
- Three error reasons (`quota` / `invalid_pdf` / `unknown`): Task 1 ✓
- Structured response `{ error, reason, retryAfterSeconds? }` from the route: Task 2 ✓
- HTTP status per reason (429 / 400 / 500): Task 1 (classifier sets status) + Task 2 (route uses it) ✓
- Human-readable quota message with parsed seconds (`{N}s` or `{m}m {s}s`): Task 1 `formatQuotaMessage` ✓
- Generic quota fallback ("try again shortly") when no hint: Task 1 + test 4 ✓
- Invalid PDF static message: Task 1 ✓
- Unknown error prefixes the original message: Task 1 + test 7 ✓
- Error with empty message → `"Parsing failed."`: Task 1 + test 8 ✓
- `Item` type gains `errorReason` and `errorRetryAfterSeconds`: Task 3 Step 3 ✓
- `useRef<Map<string, File>>`: Task 3 Step 3 ✓
- `parseOne` extracted and used by both the initial loop and retry: Task 3 Step 5 + Step 6 ✓
- `retryItem` handler: Task 3 Step 6 ✓
- Retry button in JSX: Task 3 Step 7 ✓
- File-map cleanup on save / discard: Task 3 Step 8 ✓
- Integration tests cover quota + retry success + invalid_pdf + unknown: Task 3 Step 1 (4 tests) ✓

**Placeholder scan:** no TBDs, no generic phrases. Every code step shows complete code. Task 3 Step 7 relies on the engineer running a grep to find the exact line; the surrounding context and the button JSX are both fully specified.

**Type consistency:**
- `ParsePdfErrorReason` defined in Task 1, imported by the route in Task 2 (via `classified.reason`), and mirrored as an inline string literal union in Task 3's `UploadItem` type. The string literals `"quota" | "invalid_pdf" | "unknown"` are the same in all three places. (Alternative would be to import the exported type in the page file; the inline union avoids a cross-module type dependency from a client page to the lib module and matches the existing codebase style where `UploadItem` uses local literal unions.)
- `classifyParsePdfError` signature defined in Task 1 Step 3, used in Task 2 Step 1.
- `parseOne(itemId: string, file: File)` defined in Task 3 Step 5, called from Task 3 Step 5's replaced for-loop and from Task 3 Step 6's `retryItem`.
- Fetch mock response shape in Task 3 Step 1's tests matches the route's response shape from Task 2 Step 1.

No gaps.
