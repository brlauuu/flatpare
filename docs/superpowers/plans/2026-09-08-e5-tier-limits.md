# E5 — Tier Limits as Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap members and apartments per household from environment configuration, enforced server-side, with unset meaning unlimited so self-hosters are never restricted.

**Architecture:** Two env vars read server-side by a leaf module. Counting rows needs no decryption, so the caps work against opaque envelopes. Enforcement lives in the write paths — apartment create, invitation send, invitation accept — inside the same transaction as the insert, so a concurrent pair of requests cannot both pass the check. The limits reach the browser the way `identity` already does: read in the four signed-in layouts (server components) and passed into `HouseholdDataProvider`, so no client file ever reads `process.env`.

**Tech Stack:** Next.js 16 App Router, Drizzle + libSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md` (§ "E5 — Entitlements", lines 145–152)

## Global Constraints

- `MAX_MEMBERS` and `MAX_APARTMENTS`. **Unset (or empty) means unlimited.** This is the self-hoster default and must not regress — it gets a dedicated test.
- Enforced in route handlers / the lib functions they call, **not only the UI**.
- No client-shipped file may read `process.env.MAX_*`.
- `npm run typecheck`, `npm test`, `npx eslint .` and `enola check --fail-on=cycles` all pass before each commit.

## Decision that supersedes the spec

The spec says *"The hosted deployment sets 5 and 20; a paid account is lifted to 10 and 100."* **This is no longer the model.** There is no free tier: everyone on the hosted deployment pays from day one, and self-hosters set whatever they like. So E5 ships **two** env vars with no tier dimension, and the `households.tier` column — commented "Read by E5/E6" — is **not** read by E5 at all. E6 may still use it for billing state; it does not gate entitlements.

Record this in the spec's E5 section (an annotation, not a rewrite — #206 tracks the general practice) and in `AGENTS.md`, so the next reader does not implement the 10/100 lift from a stale line.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/env-int.ts` | **Create.** `readOptionalPositiveInt(name)` — the shared "unset means unlimited" env parse. Zero imports. |
| `src/lib/rate-limit.ts` | **Modify.** Use the shared parse instead of its own copy. |
| `src/lib/limits.ts` | **Create.** `readLimits()` → `{ maxMembers, maxApartments }`, each `number \| null`. |
| `src/lib/apartments-store.ts` | **Create.** `createApartmentRow()` — count-and-insert in one transaction, mirroring `createLocation`. |
| `src/app/api/apartments/route.ts` | **Modify.** POST delegates to it. |
| `src/lib/invitations.ts` | **Modify.** Cap at send (members + pending) and at accept. |
| `src/components/household-data/household-data-provider.tsx` | **Modify.** Accept a `limits` prop, expose it on the context. |
| `src/app/{apartments,compare,guide,settings}/layout.tsx` | **Modify.** Read limits server-side, pass them in. |
| `src/app/apartments/page.tsx`, `src/app/apartments/new/page.tsx`, `src/components/household-settings.tsx` | **Modify.** Counters and disabled actions. |

---

### Task 1: The shared env parse

**Files:**
- Create: `src/lib/env-int.ts`, `src/lib/__tests__/env-int.test.ts`
- Modify: `src/lib/rate-limit.ts`, `src/lib/__tests__/rate-limit.test.ts`

**Interfaces:**
- Produces: `readOptionalPositiveInt(name: string): number | null`, `class EnvConfigError extends Error`.

E4 already wrote this parse once inside `processRateLimitPerHour`. E5 needs the same semantics twice more, so it moves to a leaf before there are three copies — the same reasoning that produced `src/lib/unique-constraint.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/env-int.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { readOptionalPositiveInt, EnvConfigError } from "../env-int";

const NAME = "FLATPARE_TEST_INT";
afterEach(() => { delete process.env[NAME]; });

describe("readOptionalPositiveInt", () => {
  it("is null when unset — every caller treats that as unlimited", () => {
    expect(readOptionalPositiveInt(NAME)).toBeNull();
  });

  it("is null when empty or whitespace, which is how an unset Vercel var arrives", () => {
    process.env[NAME] = "";
    expect(readOptionalPositiveInt(NAME)).toBeNull();
    process.env[NAME] = "   ";
    expect(readOptionalPositiveInt(NAME)).toBeNull();
  });

  it("reads a positive integer, ignoring surrounding whitespace", () => {
    process.env[NAME] = " 20 ";
    expect(readOptionalPositiveInt(NAME)).toBe(20);
  });

  it("refuses anything that is not a positive integer rather than coercing", () => {
    for (const bad of ["0", "-1", "1.5", "1e3", "abc", "Infinity", "20x"]) {
      process.env[NAME] = bad;
      expect(() => readOptionalPositiveInt(NAME), bad).toThrow(EnvConfigError);
    }
  });

  it("names the variable in the error, so the operator knows which one to fix", () => {
    process.env[NAME] = "nope";
    expect(() => readOptionalPositiveInt(NAME)).toThrow(new RegExp(NAME));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/__tests__/env-int.test.ts` → FAIL, module missing.

- [ ] **Step 3: Write the module**

```ts
// src/lib/env-int.ts
//
// The "unset means unlimited" env parse, shared by every ceiling this app
// reads (E4's PROCESS_RATE_LIMIT_PER_HOUR, E5's MAX_MEMBERS and
// MAX_APARTMENTS). Unset is always the self-hoster's default and must always
// mean "no restriction" — `docker compose up` works with no configuration.
//
// Deliberately strict about what it accepts: Number(" 1.5 ") and
// Number("1e3") both produce something, and silently accepting them would
// make the ceiling the operator wrote differ from the one in force.
//
// Zero imports: read at every layer.
export class EnvConfigError extends Error {
  constructor(name: string, raw: string) {
    super(
      `${name} must be a positive integer or unset, got "${raw}". ` +
        "Unset (or empty) means unlimited, which is the self-hosted default."
    );
    this.name = "EnvConfigError";
  }
}

export function readOptionalPositiveInt(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) throw new EnvConfigError(name, raw);
  return Number(trimmed);
}
```

- [ ] **Step 4: Point `rate-limit.ts` at it**

Replace the body of `processRateLimitPerHour` with
`return readOptionalPositiveInt("PROCESS_RATE_LIMIT_PER_HOUR");` and delete
`RateLimitConfigError`. Update `src/lib/__tests__/rate-limit.test.ts` to
import and expect `EnvConfigError` instead. Keep every other assertion in
that file unchanged — the semantics are identical, only the error class moves.

- [ ] **Step 5: Run both suites**

Run: `npx vitest run src/lib/__tests__/env-int.test.ts src/lib/__tests__/rate-limit.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/env-int.ts src/lib/__tests__/env-int.test.ts src/lib/rate-limit.ts src/lib/__tests__/rate-limit.test.ts
git commit -m "refactor: share the unset-means-unlimited env parse (#187)"
```

---

### Task 2: The apartment cap

**Files:**
- Create: `src/lib/limits.ts`, `src/lib/apartments-store.ts`
- Create: `src/lib/__tests__/limits.test.ts`, `src/lib/__tests__/apartments-store.test.ts`
- Modify: `src/app/api/apartments/route.ts`
- Test: `src/app/api/apartments/__tests__/` (extend the existing route test)

**Interfaces:**
- Produces: `readLimits(): { maxMembers: number | null; maxApartments: number | null }`,
  `createApartmentRow(householdId: number, input: { id: string; envelope: string }): Promise<ApartmentRecord>` (throws `HouseholdError("Apartment limit reached", 409)`).

**Why a transaction:** two concurrent POSTs at 19 of 20 would both count 19 and both insert. `createLocation` already establishes the count-then-insert-in-one-transaction pattern for `MAX_LOCATIONS`; follow it exactly.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/apartments-store.test.ts — sketch of the cases
it("allows unlimited apartments when MAX_APARTMENTS is unset", async () => {
  delete process.env.MAX_APARTMENTS;
  for (let i = 0; i < 25; i++) await createApartmentRow(hid, { id: newRowId(), envelope: ENV });
  expect(await countApartments(hid)).toBe(25);
});

it("refuses the row that would exceed MAX_APARTMENTS", async () => {
  process.env.MAX_APARTMENTS = "2";
  await createApartmentRow(hid, { id: newRowId(), envelope: ENV });
  await createApartmentRow(hid, { id: newRowId(), envelope: ENV });
  await expect(createApartmentRow(hid, { id: newRowId(), envelope: ENV })).rejects.toMatchObject({
    status: 409,
    message: "Apartment limit reached",
  });
  expect(await countApartments(hid)).toBe(2);
});

it("counts per household, not globally", async () => {
  process.env.MAX_APARTMENTS = "1";
  await createApartmentRow(hid, { id: newRowId(), envelope: ENV });
  await expect(createApartmentRow(otherHid, { id: newRowId(), envelope: ENV })).resolves.toBeTruthy();
});

it("does not let concurrent creates both pass the last slot", async () => {
  process.env.MAX_APARTMENTS = "3";
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => createApartmentRow(hid, { id: newRowId(), envelope: ENV }))
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  expect(await countApartments(hid)).toBe(3);
});

it("still rejects a duplicate id with 409 Duplicate id, not the limit error", async () => {
  process.env.MAX_APARTMENTS = "10";
  const id = newRowId();
  await createApartmentRow(hid, { id, envelope: ENV });
  await expect(createApartmentRow(hid, { id, envelope: ENV })).rejects.toMatchObject({
    message: "Duplicate id",
  });
});
```

- [ ] **Step 2: Run and watch fail.** `npx vitest run src/lib/__tests__/apartments-store.test.ts`

- [ ] **Step 3: Write `limits.ts` and `apartments-store.ts`**

`limits.ts` is two calls to `readOptionalPositiveInt`. `apartments-store.ts` mirrors `createLocation`: open a transaction, `select count(*)` for the household, throw `HouseholdError("Apartment limit reached", 409)` when `max !== null && count >= max`, otherwise insert and return. Keep the existing duplicate-id handling (`isUniqueConstraintError` → `ApiError("Duplicate id", 409)`) in the route or move it inside; either way both errors must still surface with their current messages.

- [ ] **Step 4: Route delegates.** `POST /api/apartments` calls `createApartmentRow` instead of inserting directly.

- [ ] **Step 5: Run and pass**, including the existing apartments route tests unchanged.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: cap apartments per household from MAX_APARTMENTS (#187)"
```

---

### Task 3: The member cap, at send and at accept

**Files:**
- Modify: `src/lib/invitations.ts`
- Test: `src/lib/__tests__/invitations.test.ts` (extend)

**Both moments, deliberately.** Accept alone is the only *correct* place — it is the moment a member appears — but it lets an owner send invitations that are guaranteed to fail and pushes the error onto the invitee. Send alone does not enforce anything: four members plus ten pending invitations is fourteen members. So:

- `createInvitation` counts **members + pending, unexpired invitations** and refuses with `InvitationError("Member limit reached", 409)`.
- `acceptInvitation` re-counts members inside its existing transaction and refuses the same way, because time passes between the two moments and the send-time count can be stale.

- [ ] **Step 1: Write the failing tests**

```ts
it("allows unlimited members when MAX_MEMBERS is unset", async () => { /* 12 invitations all send */ });

it("counts pending invitations against the cap at send time", async () => {
  process.env.MAX_MEMBERS = "3"; // owner + 2
  await createInvitation(hid, "o", "a@example.com");
  await createInvitation(hid, "o", "b@example.com");
  await expect(createInvitation(hid, "o", "c@example.com")).rejects.toMatchObject({
    status: 409,
    message: "Member limit reached",
  });
});

it("does not count an expired or revoked invitation against the cap", async () => { /* ... */ });

it("frees a slot when a pending invitation is revoked", async () => { /* ... */ });

it("refuses an accept that would exceed the cap, even though the send passed", async () => {
  // Two invitations sent while the cap allowed both, then the cap is
  // reached by other means before the second accept.
  process.env.MAX_MEMBERS = "3";
  const a = await createInvitation(hid, "o", "a@example.com");
  const b = await createInvitation(hid, "o", "b@example.com");
  await acceptInvitation(a.id, userA);
  process.env.MAX_MEMBERS = "2";
  await expect(acceptInvitation(b.id, userB)).rejects.toMatchObject({
    status: 409,
    message: "Member limit reached",
  });
});

it("leaves the invitation pending when an accept is refused by the cap", async () => {
  // The invitee must be able to retry once a slot frees, so the row must
  // NOT be flipped to accepted.
});
```

- [ ] **Step 2: Run and watch fail.**

- [ ] **Step 3: Implement both checks.** The accept-side check goes inside the existing transaction, before the membership insert, so the invitation status update and the member insert stay atomic with it.

- [ ] **Step 4: Run and pass.** `npx vitest run src/lib/__tests__/invitations.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: cap household members from MAX_MEMBERS (#187)"
```

---

### Task 4: Ship the limits to the browser

**Files:**
- Modify: `src/components/household-data/household-data-provider.tsx`
- Modify: `src/app/{apartments,compare,guide,settings}/layout.tsx`
- Test: `src/components/household-data/__tests__/fake-household-data.tsx` (add `limits` to the fixture)

`identity` already travels this exact path: read in the server-component layout, passed as a prop, exposed on the context. Follow it, so no `"use client"` file reads `process.env`.

- [ ] **Step 1:** Add `limits: { maxMembers: number | null; maxApartments: number | null }` to the provider's props and to the context value.
- [ ] **Step 2:** In each of the four layouts, `const limits = readLimits();` and pass `limits={limits}`.
- [ ] **Step 3:** Add `limits` to `makeHouseholdData()` in the test fixture, defaulting to `{ maxMembers: null, maxApartments: null }` — every existing page test then keeps its current unlimited behaviour with no edit.
- [ ] **Step 4:** `npm test` — expect no changes needed in existing page tests. If one breaks, the default above is wrong.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat: expose entitlement limits to the client (#187)"
```

---

### Task 5: UI counters

**Files:**
- Modify: `src/app/apartments/page.tsx`, `src/app/apartments/new/page.tsx`, `src/components/household-settings.tsx`
- Test: the co-located page tests

Mirror `MAX_LOCATIONS`'s treatment on the settings page (`Locations of interest (3 of 5)`), and show nothing at all when the limit is null — a self-hoster must not see a counter implying a cap that does not exist.

- [ ] **Step 1: Write the failing tests**

```ts
it("shows no apartment counter when the limit is unset", () => {
  renderWithHouseholdData(<ApartmentsPage />, { limits: { maxMembers: null, maxApartments: null } });
  expect(screen.queryByText(/of 20/)).not.toBeInTheDocument();
});

it("shows the count against the cap when a limit is set", () => {
  renderWithHouseholdData(<ApartmentsPage />, {
    apartments: [makeApartmentView(), makeApartmentView()],
    limits: { maxMembers: null, maxApartments: 20 },
  });
  expect(screen.getByText(/2 of 20/)).toBeInTheDocument();
});

it("disables the add action at the cap", () => { /* ... */ });
```

For members, `HouseholdSettings` reads `useHouseholdData().limits` and disables Invite when `members.length + invitations.length >= maxMembers`, with the count rendered beside the section heading.

- [ ] **Step 2–4:** Fail, implement, pass.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat: show entitlement counters in the UI (#187)"
```

---

### Task 6: Documentation

**Files:** `AGENTS.md`, `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md`, `.env.example` (if present)

- [ ] **Step 1:** `AGENTS.md` — an Entitlements (E5) section: the two vars, unset = unlimited, the three enforcement points, and the fact that `households.tier` is **not** read by E5. Add both vars to the Cloud-mode env vars list.
- [ ] **Step 2:** Annotate the spec's E5 section with the superseding decision (no free tier; two vars, no tier lift). Do not delete the original line — mark it superseded, per #206's practice.
- [ ] **Step 3:** Full gate: `npm run typecheck && npm test && npx eslint . && enola check --fail-on=cycles`.
- [ ] **Step 4: Commit**

```bash
git commit -am "docs: entitlement limits and the no-free-tier decision (#187)"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `MAX_MEMBERS` / `MAX_APARTMENTS` env vars | 1, 2, 3 |
| Unset means unlimited, dedicated test | 1 (parse), 2 and 3 (behaviour) |
| Enforced in route handlers, not only the UI | 2, 3 |
| Counting needs no decryption | 2, 3 — both count rows, never open an envelope |
| Hosted sets 5 and 20; paid lifted to 10 and 100 | **Superseded** — see "Decision that supersedes the spec" |

**Type consistency:** `readLimits()` returns the same object shape the provider prop and the fixture use; `number \| null` throughout, never `undefined`, so a missing limit and an unlimited one cannot be confused.

**Ordering:** 1 → 2 and 3 (independent of each other) → 4 → 5 → 6.
