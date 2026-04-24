# User-Switch Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user switches identity via the NavBar while rating an apartment, confirm if there are unsaved changes, then reload the rating form for the new user so the right person's preferences are saved.

**Architecture:** A tiny module-level `unsaved-changes` singleton tracks dirty state. The detail page writes to it in an effect and listens for a new `flatpare-user-changed` window event to reload its data. NavBar reads the flag synchronously to gate switches behind `window.confirm`, then dispatches the event after a successful cookie change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + React Testing Library, native `window.confirm`, custom window events.

**Spec:** [`docs/superpowers/specs/2026-04-24-user-switch-rating-design.md`](../specs/2026-04-24-user-switch-rating-design.md)
**Issue:** [#50](https://github.com/brlauuu/flatpare/issues/50)

---

## File Structure

### Files created

- `src/lib/unsaved-changes.ts` — 3-function singleton (`setUnsavedRating`, `getUnsavedRating`, internal flag).
- `src/lib/__tests__/unsaved-changes.test.ts` — 3 unit tests.
- `src/app/apartments/[id]/__tests__/user-switch.test.tsx` — 3 integration tests.

### Files modified

- `src/app/apartments/[id]/page.tsx` — import `setUnsavedRating`; add two effects (dirty-tracker + user-change listener).
- `src/components/nav-bar.tsx` — import `getUnsavedRating`; add `window.confirm` gates to `switchUser` / `deleteUser`; dispatch `flatpare-user-changed` after cookie mutations.

### No API, DB, schema, or env changes.

---

## Task 1: Unsaved-changes singleton (TDD)

**Files:**
- Create: `src/lib/unsaved-changes.ts`
- Create: `src/lib/__tests__/unsaved-changes.test.ts`

### Step 1: Write the failing tests

Create `src/lib/__tests__/unsaved-changes.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import {
  getUnsavedRating,
  setUnsavedRating,
} from "@/lib/unsaved-changes";

afterEach(() => {
  // Reset between tests so order doesn't matter.
  setUnsavedRating(false);
});

describe("unsaved-changes", () => {
  it("defaults to false", () => {
    expect(getUnsavedRating()).toBe(false);
  });

  it("setUnsavedRating(true) flips the flag to true", () => {
    setUnsavedRating(true);
    expect(getUnsavedRating()).toBe(true);
  });

  it("setUnsavedRating(false) flips the flag back to false", () => {
    setUnsavedRating(true);
    setUnsavedRating(false);
    expect(getUnsavedRating()).toBe(false);
  });
});
```

### Step 2: Run tests to confirm they fail

Run: `npm test -- src/lib/__tests__/unsaved-changes.test.ts`
Expected: 3 fail — `Cannot find module '@/lib/unsaved-changes'`.

### Step 3: Implement the singleton

Create `src/lib/unsaved-changes.ts`:

```ts
let hasUnsavedRating = false;

export function setUnsavedRating(value: boolean): void {
  hasUnsavedRating = value;
}

export function getUnsavedRating(): boolean {
  return hasUnsavedRating;
}
```

### Step 4: Run tests — should pass

Run: `npm test -- src/lib/__tests__/unsaved-changes.test.ts`
Expected: 3 pass.

### Step 5: Full suite + lint

Run: `npm test && npm run lint`
Expected: 211/211 tests pass (prior 208 + 3 new), lint clean.

### Step 6: Commit

```bash
git add src/lib/unsaved-changes.ts src/lib/__tests__/unsaved-changes.test.ts
git commit -m "feat: add unsaved-rating singleton"
```

---

## Task 2: Detail-page effects + integration tests (TDD)

Wire the detail page to write the dirty flag and to re-load apartment data when a user-change event fires.

**Files:**
- Modify: `src/app/apartments/[id]/page.tsx`
- Create: `src/app/apartments/[id]/__tests__/user-switch.test.tsx`

### Step 1: Write the failing integration tests

Create `src/app/apartments/[id]/__tests__/user-switch.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push, refresh }),
}));

import ApartmentDetailPage from "../page";

const APARTMENT_WITH_TWO_RATINGS = {
  id: 42,
  name: "Test Flat",
  address: null,
  sizeM2: null,
  numRooms: null,
  numBathrooms: null,
  numBalconies: null,
  hasWashingMachine: null,
  rentChf: null,
  distanceBikeMin: null,
  distanceTransitMin: null,
  pdfUrl: null,
  listingUrl: null,
  shortCode: "ABC-?B-?b-W?-?",
  ratings: [
    {
      id: 1,
      userName: "Alice",
      kitchen: 5,
      balconies: 5,
      location: 5,
      floorplan: 5,
      overallFeeling: 5,
      comment: "alice comment",
    },
    {
      id: 2,
      userName: "Bob",
      kitchen: 2,
      balconies: 2,
      location: 2,
      floorplan: 2,
      overallFeeling: 2,
      comment: "bob comment",
    },
  ],
};

let currentCookie = "flatpare-name=Alice";

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  currentCookie = "flatpare-name=Alice";

  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => currentCookie,
    set: () => {},
  });

  vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/apartments") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }
    if (url.endsWith("/api/apartments/42")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(APARTMENT_WITH_TWO_RATINGS),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartment detail — user switch", () => {
  it("shows the current user's rating on mount", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/Comment/i) as HTMLTextAreaElement).value
    ).toBe("alice comment");
  });

  it("reloads the form for the new user when a user-change event fires", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });

    // Simulate NavBar flipping the cookie and announcing the change.
    currentCookie = "flatpare-name=Bob";
    window.dispatchEvent(new Event("flatpare-user-changed"));

    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Bob\)/)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/Comment/i) as HTMLTextAreaElement).value
    ).toBe("bob comment");
  });

  it("reloads to an empty rating when the new user has none", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });

    currentCookie = "flatpare-name=Charlie";
    window.dispatchEvent(new Event("flatpare-user-changed"));

    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Charlie\)/)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/Comment/i) as HTMLTextAreaElement).value
    ).toBe("");
  });
});
```

### Step 2: Run tests to confirm they fail

Run: `npm test -- src/app/apartments/\[id\]/__tests__/user-switch.test.tsx`
Expected: test 1 passes (existing behavior works on mount). Tests 2 and 3 fail — the event has no listener yet; `Your Rating (Alice)` is still shown because the page never reloads.

### Step 3: Add imports to `src/app/apartments/[id]/page.tsx`

Near the existing `@/lib/fetch-error` import at the top of the file, add:

```tsx
import { setUnsavedRating } from "@/lib/unsaved-changes";
```

### Step 4: Add the dirty-tracker effect

Inside `ApartmentDetailPage()`, below the existing `useEffect` that fetches the apartment on mount (`return () => { cancelled = true; };` at around line 174), add:

```tsx
useEffect(() => {
  const dirty =
    myRating.kitchen !== cleanRating.kitchen ||
    myRating.balconies !== cleanRating.balconies ||
    myRating.location !== cleanRating.location ||
    myRating.floorplan !== cleanRating.floorplan ||
    myRating.overallFeeling !== cleanRating.overallFeeling ||
    myRating.comment !== cleanRating.comment;
  setUnsavedRating(dirty);
  return () => setUnsavedRating(false);
}, [myRating, cleanRating]);
```

### Step 5: Add the user-change listener effect

Directly after the dirty-tracker effect, add:

```tsx
useEffect(() => {
  function handler() {
    reloadApartment();
  }
  window.addEventListener("flatpare-user-changed", handler);
  return () => window.removeEventListener("flatpare-user-changed", handler);
  // reloadApartment is defined in this component scope; React hooks eslint may
  // want it in deps — it's stable within this render and the ref-like usage is
  // intentional. Using an inline closure keeps the effect body concise.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

### Step 6: Run the new tests — should pass

Run: `npm test -- src/app/apartments/\[id\]/__tests__/user-switch.test.tsx`
Expected: 3 tests pass.

### Step 7: Run the full suite and lint

Run: `npm test && npm run lint`
Expected: all tests pass (214 total = prior 208 + 3 unit + 3 integration = 214), lint clean.

### Step 8: Commit

```bash
git add src/app/apartments/[id]/page.tsx src/app/apartments/[id]/__tests__/user-switch.test.tsx
git commit -m "feat: detail page reloads rating on user change"
```

---

## Task 3: NavBar confirm + event dispatch

**Files:**
- Modify: `src/components/nav-bar.tsx`

No new tests — per spec, NavBar's flow is simple and the existing integration tests for other pages don't interact with user switching.

### Step 1: Import the tracker

At the top of `src/components/nav-bar.tsx`, add:

```tsx
import { getUnsavedRating } from "@/lib/unsaved-changes";
```

### Step 2: Update `switchUser`

Find the existing `switchUser` function (around line 40):

```ts
async function switchUser(name: string) {
  if (name === userName) return;
  await fetch("/api/auth/name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  router.refresh();
}
```

Replace with:

```ts
async function switchUser(name: string) {
  if (name === userName) return;
  if (getUnsavedRating()) {
    const ok = window.confirm(
      "You have unsaved rating changes. Switch user anyway? Your input will be discarded."
    );
    if (!ok) return;
  }
  await fetch("/api/auth/name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  window.dispatchEvent(new Event("flatpare-user-changed"));
  router.refresh();
}
```

### Step 3: Update `deleteUser`

Find the existing `deleteUser` function (around line 50):

```ts
async function deleteUser(name: string) {
  const res = await fetch(
    `/api/auth/users/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
  if (!res.ok) return;
  const data = (await res.json()) as { switchedTo?: string | null };
  if (data.switchedTo === null) {
    router.push("/");
  } else {
    router.refresh();
  }
}
```

Replace with:

```ts
async function deleteUser(name: string) {
  if (name === userName && getUnsavedRating()) {
    const ok = window.confirm(
      "You have unsaved rating changes. Delete yourself anyway? Your input will be discarded."
    );
    if (!ok) return;
  }
  const res = await fetch(
    `/api/auth/users/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
  if (!res.ok) return;
  const data = (await res.json()) as { switchedTo?: string | null };
  if (data.switchedTo !== undefined) {
    window.dispatchEvent(new Event("flatpare-user-changed"));
  }
  if (data.switchedTo === null) {
    router.push("/");
  } else {
    router.refresh();
  }
}
```

### Step 4: Run the full suite and lint

Run: `npm test && npm run lint`
Expected: 214/214 tests pass, lint clean.

### Step 5: Run the build

Run: `npm run build`
Expected: build succeeds.

### Step 6: Commit

```bash
git add src/components/nav-bar.tsx
git commit -m "feat: NavBar confirms unsaved rating before user switch (#50)"
```

---

## Task 4: Open PR

**Files:** none — workflow only.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 50-user-switch-rating`
Expected: branch published.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: user-switch during rating reloads form for new user (#50)" \
  --body "$(cat <<'EOF'
## Summary
- Tracks "unsaved rating changes" in a tiny singleton (\`src/lib/unsaved-changes.ts\`).
- Detail page reads the flag via an effect and listens for a new \`flatpare-user-changed\` window event; on fire, it reloads the apartment and re-derives the rating form from the new cookie.
- NavBar's \`switchUser\` and \`deleteUser\` show a \`window.confirm\` when there are unsaved changes; on proceed, they dispatch the event so the detail page updates without the user having to navigate away.

## Test plan
- [x] \`npm test\` passes (3 singleton tests + 3 integration tests, 214 total)
- [x] \`npm run lint\` clean
- [x] \`npm run build\` succeeds
- [ ] Vercel preview: rate an apartment partially, switch users via the NavBar dropdown — confirm dialog appears; cancel keeps you on the old user; confirm loads the new user's rating form.

Closes #50

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Hand back to the controller.**

---

## Self-Review Checklist

**Spec coverage:**
- `src/lib/unsaved-changes.ts` singleton with `getUnsavedRating` / `setUnsavedRating`: Task 1 ✓
- 3 unit tests for the singleton: Task 1 Step 1 ✓
- Detail page writes the flag via effect on `myRating`/`cleanRating`: Task 2 Step 4 ✓
- Effect cleanup clears flag on unmount: Task 2 Step 4 (return function) ✓
- Detail page listens for `flatpare-user-changed` and calls `reloadApartment`: Task 2 Step 5 ✓
- 3 integration tests: Task 2 Step 1 ✓
- NavBar `switchUser` gate via `window.confirm` when flag is set: Task 3 Step 2 ✓
- NavBar dispatches `flatpare-user-changed` after cookie mutations: Task 3 Step 2 (switchUser) + Step 3 (deleteUser) ✓
- NavBar `deleteUser` confirms only when self-deleting: Task 3 Step 3 (`if (name === userName && getUnsavedRating())`) ✓
- NavBar `deleteUser` dispatches only when `switchedTo !== undefined`: Task 3 Step 3 ✓

**Placeholder scan:** no TBDs, no "implement later". Every code step shows complete code.

**Type consistency:**
- `setUnsavedRating` / `getUnsavedRating` signatures match between Task 1 definition and Tasks 2/3 imports.
- Custom event name `"flatpare-user-changed"` used identically in Tasks 2 (listener) and 3 (dispatcher).
- Test Step 1 mocks in `user-switch.test.tsx` match the route/fetch contract used elsewhere.

No gaps.
