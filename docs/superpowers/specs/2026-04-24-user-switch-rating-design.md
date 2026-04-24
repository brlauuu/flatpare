# User-switch during rating — design

**Issue:** [#50 — If the user changes in the middle of rating the apartment, the rating should be updated so that the right user's preferences are saved](https://github.com/brlauuu/flatpare/issues/50)
**Date:** 2026-04-24

## Problem

On the apartment detail page, the rating form loads its data (existing stars + comment) for the current user identified by the `flatpare-name` cookie. The page reads the cookie ONCE — during the initial apartment fetch (`applyApartmentData`). If the user then switches their identity via the NavBar user switcher mid-editing, two failure modes occur:

1. The rating form still shows the previous user's input (or their saved rating, if any).
2. Saving the form writes those inputs to the DB under the NEW user's name — overwriting or creating the new user's rating with data the previous user entered.

## Scope

- Detect user switches (NavBar's `switchUser` and self-deletion in `deleteUser`) and notify the detail page.
- When a switch happens with unsaved rating changes, ask for confirmation first. On cancel, don't switch. On confirm, discard the in-progress input and reload the form for the new user.
- Module-level "unsaved rating" flag so NavBar can check synchronously without re-rendering on every keystroke.
- No change to the server or database.

## "Unsaved rating" tracker

New module: `src/lib/unsaved-changes.ts` — a minimal singleton.

```ts
let hasUnsavedRating = false;
export function setUnsavedRating(v: boolean) { hasUnsavedRating = v; }
export function getUnsavedRating(): boolean { return hasUnsavedRating; }
```

- **Detail page writes to it** in an effect whose dependencies are `myRating` and `cleanRating`. The effect computes dirty-ness (same 6-field comparison that already gates the Save button) and calls `setUnsavedRating(dirty)`. Effect cleanup clears the flag when the page unmounts.
- **NavBar reads from it** synchronously in `switchUser` / `deleteUser` click handlers.
- Not exposed via React context. A plain module variable is correct for this shape — one reader (NavBar), one writer (detail page), no re-renders needed on changes.

## Detail page (`src/app/apartments/[id]/page.tsx`) changes

### New effect: dirty tracker

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

Cleanup fires on unmount AND between re-runs. Net effect: the flag is correct after every commit; on unmount (navigation away) it resets to `false` cleanly.

### New effect: listen for `flatpare-user-changed`

```tsx
useEffect(() => {
  function handler() {
    reloadApartment();
  }
  window.addEventListener("flatpare-user-changed", handler);
  return () => window.removeEventListener("flatpare-user-changed", handler);
}, []);
```

`reloadApartment` is already defined in the page; it calls `applyApartmentData(fetch(/api/apartments/:id))`, which re-reads the cookie and derives `myRating`/`cleanRating` from the fresh user's existing rating (or `EMPTY_RATING`). Nothing new needed inside `applyApartmentData`.

## NavBar (`src/components/nav-bar.tsx`) changes

### Import the tracker

```tsx
import { getUnsavedRating } from "@/lib/unsaved-changes";
```

### `switchUser` confirmation + dispatch

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

### `deleteUser` confirmation + dispatch

Confirmation gate fires only when the deleted user is the current user (deleting someone else doesn't change your identity). Dispatch fires only when the server actually changed your identity (`switchedTo !== undefined`):

```ts
async function deleteUser(name: string) {
  if (name === userName && getUnsavedRating()) {
    const ok = window.confirm(
      "You have unsaved rating changes. Delete yourself anyway? Your input will be discarded."
    );
    if (!ok) return;
  }
  const res = await fetch(`/api/auth/users/${encodeURIComponent(name)}`, { method: "DELETE" });
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

## Why custom event (not `router.refresh()` alone)

`router.refresh()` re-fetches server components (the layout with its `userName` prop on the NavBar) but does NOT re-run the client page's `useEffect`s or reset its `useState`. The detail page's `myRating` / `userName` state stays as-is. A custom event is the explicit, minimal signal that tells the page "the cookie changed — re-read apartment data".

The event name `flatpare-user-changed` joins the existing family of custom events the project uses for same-tab synchronization (`flatpare-apartments-sort-change`, `flatpare-apartments-view-change`, `flatpare-compare-sort-change`).

## Testing

### Unit tests — `src/lib/__tests__/unsaved-changes.test.ts` (new, 3 tests)

1. Defaults to `false`.
2. `setUnsavedRating(true)` → `getUnsavedRating()` is `true`.
3. `setUnsavedRating(false)` after a true → `getUnsavedRating()` is `false`.

### Integration tests — `src/app/apartments/[id]/__tests__/user-switch.test.tsx` (new, 3 tests)

Fixture: an apartment with two ratings on it (Alice and Bob) plus no-rating-for-a-new-user case. Tests drive the custom event directly, not through NavBar — the event is the contract between the two components.

1. **Initial load shows the current user's rating.** Cookie is `flatpare-name=Alice`. On mount, the form shows Alice's stars and comment.
2. **Dispatching `flatpare-user-changed` with the cookie switched to Bob reloads the form.** Test updates `document.cookie` to Bob, dispatches the event, and asserts the form shows Bob's values.
3. **Dispatching the event with the cookie switched to a new user (not in ratings) reloads to the empty state.** All sliders back to 0 stars, empty comment.

### No NavBar-level integration test

NavBar's flow (read flag → `window.confirm` → dispatch → refresh) is simple enough that mocking `window.confirm` + asserting the fetch and dispatch calls has low marginal value relative to the test scaffolding needed to mount NavBar in isolation (it depends on `useRouter`, `usePathname`, and a fetch to `/api/auth/users`). The unit tests and the two integration tests together cover the real behavior. If the team later adds a regression around the confirm flow, we can add a NavBar test then.

### Existing tests

Unchanged. `rating-cancel.test.tsx`, `edit-flow.test.tsx`, `pager.test.tsx`, `retry.test.tsx` don't interact with user switching.

## Out of scope

- Auto-save the previous user's input before switching (rejected).
- A real modal for the confirm (native `window.confirm` is fine for this personal app).
- Warning the user when they close the tab with unsaved rating input (`beforeunload`).
- Syncing user identity across browser tabs (storage events / `BroadcastChannel`).
- Any changes to `/api/auth/name` or `/api/auth/users/:name`.

## Security notes

- `window.confirm` is a passive gate — no data flows through it.
- The singleton module is per-browser-tab. Two tabs can hold different "dirty" flags without interference.
- No new inputs, no new endpoints, no new trust boundaries.
