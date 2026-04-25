# Configurable Train-Station Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `BASEL_SBB` constants in `src/lib/distance.ts` with an editable app-wide setting backed by a new `app_settings` table, plus a `/settings` page to edit it and recompute existing distances.

**Architecture:** Generic key-value `app_settings` table (single key in this PR: `station_address`). Helper module exposes `getStationAddress` / `setStationAddress`. Distance lib reads via `getStationAddress`. New `/settings` route renders an `<Input>` for the address plus a "Recompute all" button. Three new API routes: GET/PUT `/api/settings` and POST `/api/settings/recompute-distances`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle (SQLite), Vitest, shadcn/ui Input + Button.

**Spec:** [`docs/superpowers/specs/2026-04-25-station-settings-design.md`](../specs/2026-04-25-station-settings-design.md)
**Issue:** [#56](https://github.com/brlauuu/flatpare/issues/56) (follow-up [#85](https://github.com/brlauuu/flatpare/issues/85))

---

## File Structure

### Files created

- `src/lib/app-settings.ts` — `getStationAddress` / `setStationAddress`.
- `src/lib/__tests__/app-settings.test.ts` — 4 unit tests.
- `src/app/api/settings/route.ts` — GET + PUT handlers.
- `src/app/api/settings/recompute-distances/route.ts` — POST handler.
- `src/app/settings/layout.tsx` — server component reading the user cookie + NavBar wrapper.
- `src/app/settings/page.tsx` — client form + recompute UI.
- `src/app/settings/__tests__/settings-page.test.tsx` — 4 integration tests.

### Files modified

- `src/lib/db/schema.ts` — add the `appSettings` table.
- `drizzle/<auto-named>.sql` — generated migration.
- `src/lib/distance.ts` — delete `BASEL_SBB` / `BASEL_SBB_COORDS`; read from settings.
- `src/components/nav-bar.tsx` — add `/settings` to `navItems`.

---

## Task 1: DB schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/<auto-named>.sql` (Drizzle generates)

### Step 1: Add the table

Append the new table to `src/lib/db/schema.ts` (after the existing `ratings` block / `apiUsage` block — wherever the file's table declarations end):

```ts
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});
```

### Step 2: Generate the migration

Run: `npm run db:generate`
Expected: a new file appears under `drizzle/` (e.g. `0005_*.sql`) containing `CREATE TABLE app_settings (...)`. If interactive, accept the default migration name.

### Step 3: Apply the migration

Run: `npm run db:push`
Expected: applies the table to the local SQLite DB. Accept any prompts.

### Step 4: Verify the build is still clean

Run: `npm run build`
Expected: build succeeds. The new table is in the typed schema, but no consumer references it yet.

### Step 5: Test + lint

Run: `npm test && npm run lint`
Expected: 231 tests pass (no new tests yet; some `migrate.test.ts` tests reference the migration count and may need updating). If `migrate.test.ts` fails because it hardcodes the migration count, bump the count by 1 — the failure looks like `expected 5 to be 6` or similar.

### Step 6: Commit

```bash
git add src/lib/db/schema.ts drizzle/ src/lib/__tests__/migrate.test.ts
git commit -m "feat: add app_settings table"
```

(Include `migrate.test.ts` in the add only if it was modified.)

---

## Task 2: `app-settings` helpers (TDD)

**Files:**
- Create: `src/lib/app-settings.ts`
- Create: `src/lib/__tests__/app-settings.test.ts`

### Step 1: Write the failing tests

Create `src/lib/__tests__/app-settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import {
  DEFAULT_STATION_ADDRESS,
  getStationAddress,
  setStationAddress,
} from "@/lib/app-settings";

beforeEach(async () => {
  await db.delete(appSettings);
});

afterEach(async () => {
  await db.delete(appSettings);
});

describe("app-settings", () => {
  it("returns the default when the table has no row for station_address", async () => {
    const value = await getStationAddress();
    expect(value).toBe(DEFAULT_STATION_ADDRESS);
  });

  it("returns the stored value after setStationAddress", async () => {
    await setStationAddress("Zürich HB, Switzerland");
    const value = await getStationAddress();
    expect(value).toBe("Zürich HB, Switzerland");
  });

  it("upserts — calling setStationAddress twice keeps a single row", async () => {
    await setStationAddress("Zürich HB, Switzerland");
    await setStationAddress("Bern, Schweiz");
    const value = await getStationAddress();
    expect(value).toBe("Bern, Schweiz");
    const rows = await db.select().from(appSettings);
    expect(rows.length).toBe(1);
  });

  it("throws when given an empty or whitespace-only string", async () => {
    await expect(setStationAddress("")).rejects.toThrow();
    await expect(setStationAddress("   ")).rejects.toThrow();
  });
});
```

### Step 2: Run tests — should fail

Run: `npm test -- src/lib/__tests__/app-settings.test.ts`
Expected: 4 fail with `Cannot find module '@/lib/app-settings'`.

### Step 3: Implement

Create `src/lib/app-settings.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

export const DEFAULT_STATION_ADDRESS = "Basel SBB, Switzerland";

const STATION_ADDRESS_KEY = "station_address";

export async function getStationAddress(): Promise<string> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, STATION_ADDRESS_KEY))
    .limit(1);
  return row[0]?.value ?? DEFAULT_STATION_ADDRESS;
}

export async function setStationAddress(value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error("Station address cannot be empty");
  }
  await db
    .insert(appSettings)
    .values({ key: STATION_ADDRESS_KEY, value: trimmed })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: trimmed, updatedAt: new Date() },
    });
}
```

### Step 4: Run tests — should pass

Run: `npm test -- src/lib/__tests__/app-settings.test.ts`
Expected: 4 pass.

### Step 5: Full suite + lint

Run: `npm test && npm run lint`
Expected: 235 pass (231 + 4), lint clean.

### Step 6: Commit

```bash
git add src/lib/app-settings.ts src/lib/__tests__/app-settings.test.ts
git commit -m "feat: add app-settings helpers for station address"
```

---

## Task 3: Distance lib reads from settings

**Files:**
- Modify: `src/lib/distance.ts`

### Step 1: Update `src/lib/distance.ts`

Open the file. Apply:

**1a)** Add the import at the top (after the existing `@/lib/db` import):

```ts
import { getStationAddress } from "@/lib/app-settings";
```

**1b)** Delete the constants:

```ts
const BASEL_SBB = "Basel SBB, Switzerland";
const BASEL_SBB_COORDS = { lat: 47.5476, lng: 7.5897 };
```

**1c)** Modify `calculateWithGoogleMaps(address)` to first fetch the station, then pass it down. Replace its body:

```ts
async function calculateWithGoogleMaps(
  address: string
): Promise<DistanceResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;
  const stationAddress = await getStationAddress();
  const results: DistanceResult = { bikeMinutes: null, transitMinutes: null };

  try {
    const [bikeRes, transitRes] = await Promise.all([
      fetchGoogleDistance(stationAddress, address, "bicycling", apiKey),
      fetchGoogleDistance(stationAddress, address, "transit", apiKey),
    ]);

    results.bikeMinutes = bikeRes;
    results.transitMinutes = transitRes;

    try {
      await db.insert(apiUsage).values({
        service: "google_maps",
        operation: "calculate_distance",
      });
    } catch {
      // Don't fail distance calc if logging fails
    }
  } catch {
    // Return nulls on failure
  }

  return results;
}
```

**1d)** Update `fetchGoogleDistance` to accept the origin as the first argument:

```ts
async function fetchGoogleDistance(
  origin: string,
  destination: string,
  mode: string,
  apiKey: string
): Promise<number | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json"
  );
  url.searchParams.set("origins", origin);
  url.searchParams.set("destinations", destination);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  const data = await res.json();

  const element = data.rows?.[0]?.elements?.[0];
  if (element?.status !== "OK") return null;

  return Math.round(element.duration.value / 60);
}
```

**1e)** Modify `calculateWithOpenRouteService(address)` to geocode the station address each call:

```ts
async function calculateWithOpenRouteService(
  address: string
): Promise<DistanceResult> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY!;
  const stationAddress = await getStationAddress();
  const results: DistanceResult = { bikeMinutes: null, transitMinutes: null };

  try {
    const stationCoords = await geocodeWithORS(stationAddress, apiKey);
    if (!stationCoords) return results;

    const coords = await geocodeWithORS(address, apiKey);
    if (!coords) return results;

    const bikeRes = await fetchORSRoute(
      stationCoords,
      coords,
      "cycling-regular",
      apiKey
    );
    results.bikeMinutes = bikeRes;
    // ORS doesn't support public transit — leave transitMinutes as null

    try {
      await db.insert(apiUsage).values({
        service: "openrouteservice",
        operation: "calculate_distance",
      });
    } catch {
      // Don't fail if logging fails
    }
  } catch {
    // Return nulls on failure
  }

  return results;
}
```

`geocodeWithORS` and `fetchORSRoute` stay as they are — the only change to their callers is the new geocoding-the-station call.

### Step 2: Test + lint + build

Run: `npm test && npm run lint && npm run build`
Expected: 235 pass (no new tests; existing distance code has none, so no test had to mock the constants). Lint + build clean.

### Step 3: Commit

```bash
git add src/lib/distance.ts
git commit -m "refactor: distance lib reads station from app-settings"
```

---

## Task 4: API routes for settings + recompute

**Files:**
- Create: `src/app/api/settings/route.ts`
- Create: `src/app/api/settings/recompute-distances/route.ts`

### Step 1: Create `src/app/api/settings/route.ts`

```ts
import { NextResponse } from "next/server";
import { getStationAddress, setStationAddress } from "@/lib/app-settings";

export async function GET() {
  try {
    const stationAddress = await getStationAddress();
    return NextResponse.json({ stationAddress });
  } catch (error) {
    console.error("[settings:GET] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load settings",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { stationAddress?: unknown };
    const { stationAddress } = body;

    if (typeof stationAddress !== "string" || stationAddress.trim() === "") {
      return NextResponse.json(
        { error: "stationAddress must be a non-empty string" },
        { status: 400 }
      );
    }

    await setStationAddress(stationAddress);
    return NextResponse.json({ stationAddress: stationAddress.trim() });
  } catch (error) {
    console.error("[settings:PUT] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save settings",
      },
      { status: 500 }
    );
  }
}
```

### Step 2: Create `src/app/api/settings/recompute-distances/route.ts`

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { calculateDistance } from "@/lib/distance";

export async function POST() {
  try {
    const all = await db
      .select({ id: apartments.id, address: apartments.address })
      .from(apartments);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const apt of all) {
      if (!apt.address) {
        skipped++;
        continue;
      }
      try {
        const { bikeMinutes, transitMinutes } = await calculateDistance(
          apt.address
        );
        if (bikeMinutes === null && transitMinutes === null) {
          failed++;
          continue;
        }
        await db
          .update(apartments)
          .set({
            distanceBikeMin: bikeMinutes,
            distanceTransitMin: transitMinutes,
          })
          .where(eq(apartments.id, apt.id));
        updated++;
      } catch (err) {
        console.error(`[recompute] apartment ${apt.id} failed:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      total: all.length,
      updated,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("[settings/recompute:POST] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to recompute",
      },
      { status: 500 }
    );
  }
}
```

### Step 3: Test + lint + build

Run: `npm test && npm run lint && npm run build`
Expected: 235 pass (no new tests yet for these routes; the integration tests in Task 5 mock the responses). Lint + build clean.

### Step 4: Commit

```bash
git add src/app/api/settings/
git commit -m "feat: API routes for settings + recompute-distances"
```

---

## Task 5: Settings page + tests

**Files:**
- Create: `src/app/settings/layout.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/__tests__/settings-page.test.tsx`
- Modify: `src/components/nav-bar.tsx`

### Step 1: Add `/settings` to the nav

In `src/components/nav-bar.tsx`, find the `navItems` array (around line 21) and insert a new entry between "Costs" and "Guide":

```ts
const navItems = [
  { href: "/apartments", label: "Apartments" },
  { href: "/apartments/new", label: "Upload" },
  { href: "/compare", label: "Compare" },
  { href: "/costs", label: "Costs" },
  { href: "/settings", label: "Settings" },
  { href: "/guide", label: "Guide" },
];
```

### Step 2: Create the layout

Create `src/app/settings/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { NavBar } from "@/components/nav-bar";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const userName = cookieStore.get("flatpare-name")?.value ?? "Unknown";

  return (
    <>
      <NavBar userName={userName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-20 sm:pb-6">
        {children}
      </main>
    </>
  );
}
```

### Step 3: Write the failing integration tests

Create `src/app/settings/__tests__/settings-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SettingsPage from "../page";

let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  fetchCalls = [];
  vi.spyOn(global, "fetch").mockImplementation(((
    input: RequestInfo,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    fetchCalls.push({ url, init: init ?? {} });
    const method = init?.method ?? "GET";

    if (url === "/api/settings" && method === "GET") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ stationAddress: "Basel SBB, Switzerland" }),
      } as Response);
    }
    if (url === "/api/settings" && method === "PUT") {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ stationAddress: body.stationAddress }),
      } as Response);
    }
    if (
      url === "/api/settings/recompute-distances" &&
      method === "POST"
    ) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ updated: 4, failed: 1, skipped: 0, total: 5 }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Settings page", () => {
  it("loads the existing setting on mount and shows it in the input", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const input = screen.getByLabelText(/Station address/i) as HTMLInputElement;
      expect(input.value).toBe("Basel SBB, Switzerland");
    });
  });

  it("disables Save when the input is empty", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const input = await waitFor(() => {
      const i = screen.getByLabelText(/Station address/i) as HTMLInputElement;
      expect(i.value).toBe("Basel SBB, Switzerland");
      return i;
    });
    await user.clear(input);
    expect(screen.getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  it("disables Save when the input matches the loaded value", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const i = screen.getByLabelText(/Station address/i) as HTMLInputElement;
      expect(i.value).toBe("Basel SBB, Switzerland");
    });
    expect(screen.getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  it("clicking Recompute calls the recompute endpoint and shows the result", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Station address/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Recomputed 4 of 5 apartments/i)
      ).toBeInTheDocument();
    });
    const recomputeCall = fetchCalls.find(
      (c) => c.url === "/api/settings/recompute-distances"
    );
    expect(recomputeCall).toBeDefined();
    expect(recomputeCall!.init.method).toBe("POST");
  });
});
```

### Step 4: Run tests to confirm they fail

Run: `npm test -- src/app/settings/__tests__/settings-page.test.tsx`
Expected: 4 fail — no `SettingsPage` component yet.

### Step 5: Create the settings page

Create `src/app/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import {
  type ErrorDetails,
  fetchErrorFromResponse,
  fetchErrorFromException,
} from "@/lib/fetch-error";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

export default function SettingsPage() {
  const [loaded, setLoaded] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);

  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);

  useEffect(() => {
    const url = "/api/settings";
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          setError({
            headline: "Couldn't load settings",
            details: await fetchErrorFromResponse(res, url),
          });
          return;
        }
        const data = (await res.json()) as { stationAddress: string };
        setLoaded(data.stationAddress);
        setValue(data.stationAddress);
      } catch (err) {
        setError({
          headline: "Couldn't load settings",
          details: fetchErrorFromException(err, url),
        });
      }
    })();
  }, []);

  const trimmed = value.trim();
  const canSave = trimmed !== "" && trimmed !== loaded.trim() && !saving;

  async function handleSave() {
    setSaving(true);
    setSavedJustNow(false);
    const url = "/api/settings";
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationAddress: trimmed }),
      });
      if (!res.ok) {
        setError({
          headline: "Couldn't save settings",
          details: await fetchErrorFromResponse(res, url),
        });
        setSaving(false);
        return;
      }
      const data = (await res.json()) as { stationAddress: string };
      setLoaded(data.stationAddress);
      setValue(data.stationAddress);
      setSavedJustNow(true);
      setError(null);
    } catch (err) {
      setError({
        headline: "Couldn't save settings",
        details: fetchErrorFromException(err, url),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeResult(null);
    const url = "/api/settings/recompute-distances";
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        setError({
          headline: "Couldn't recompute distances",
          details: await fetchErrorFromResponse(res, url),
        });
        setRecomputing(false);
        return;
      }
      const data = (await res.json()) as {
        updated: number;
        failed: number;
        skipped: number;
        total: number;
      };
      setRecomputeResult(
        `Recomputed ${data.updated} of ${data.total} apartments` +
          (data.failed > 0 ? ` (${data.failed} failed)` : "") +
          (data.skipped > 0 ? ` (${data.skipped} skipped — no address)` : "")
      );
      setError(null);
    } catch (err) {
      setError({
        headline: "Couldn't recompute distances",
        details: fetchErrorFromException(err, url),
      });
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <section className="space-y-2">
        <Label htmlFor="station-address">Train station address</Label>
        <Input
          id="station-address"
          aria-label="Station address"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSavedJustNow(false);
          }}
        />
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {savedJustNow && (
            <span className="text-sm text-muted-foreground">Saved.</span>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recompute distances</h2>
        <p className="text-sm text-muted-foreground">
          Rebuild bike and transit minutes for every apartment using the current
          station address.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRecompute}
            disabled={recomputing}
          >
            {recomputing ? "Recomputing…" : "Recompute all"}
          </Button>
          {recomputeResult && (
            <span className="text-sm text-muted-foreground">
              {recomputeResult}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
```

### Step 6: Run the integration tests — should pass

Run: `npm test -- src/app/settings/__tests__/settings-page.test.tsx`
Expected: 4 pass.

### Step 7: Run the full suite + lint + build

Run: `npm test && npm run lint && npm run build`
Expected: 239 pass (235 + 4), lint clean, build clean.

### Step 8: Commit

```bash
git add src/app/settings/ src/components/nav-bar.tsx
git commit -m "feat: add settings page for train station address (#56)"
```

---

## Task 6: Open PR

**Files:** none.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin 56-station-settings`
Expected: branch published.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "feat: configurable train-station address (#56)" \
  --body "$(cat <<'EOF'
## Summary
- New `app_settings` key-value table; first key is `station_address`.
- `getStationAddress` / `setStationAddress` helpers in `src/lib/app-settings.ts`. Default falls back to `"Basel SBB, Switzerland"` so existing behavior is unchanged on first deploy.
- Distance lib reads from settings; hardcoded `BASEL_SBB` constants are gone. ORS path geocodes the station address per call (acceptable cost for a personal app).
- New `/settings` page with an editable address input and a "Recompute all" button that re-runs distance for every apartment.
- Three new API routes: `GET /api/settings`, `PUT /api/settings`, `POST /api/settings/recompute-distances`.
- Follow-up issue #85 tracks the bigger "locations of interest" feature deferred from this PR.

## Test plan
- [x] `npm test` passes (4 helper tests + 4 integration tests, 239 total)
- [x] `npm run lint` clean
- [x] `npm run build` succeeds
- [ ] Vercel preview: open `/settings`, change the address, confirm "Saved", click "Recompute all", confirm the result message; reload to verify persistence.

Closes #56

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Hand back to controller.**

---

## Self-Review Checklist

**Spec coverage:**
- New `app_settings` key-value table: Task 1 ✓
- `getStationAddress` / `setStationAddress` helpers with default fallback: Task 2 ✓
- Distance lib reads from settings; hardcoded constants removed: Task 3 ✓
- Both Google Maps and ORS paths use the dynamic station: Task 3 ✓
- ORS geocodes the station per call: Task 3 ✓
- `/settings` page UI: Task 5 ✓
- Save button disabled when empty OR unchanged: Task 5 Step 5 ✓
- Recompute button + result rendering: Task 5 Step 5 ✓
- Three API routes: Task 4 ✓
- POST recompute returns `{ updated, failed, skipped, total }`: Task 4 Step 2 ✓
- `/settings` added to NavBar: Task 5 Step 1 ✓
- 4 helper tests: Task 2 ✓
- 4 integration tests: Task 5 Step 3 ✓
- No new distance.ts tests (per spec): no task ✓
- Migration generated and applied: Task 1 Steps 2–3 ✓
- "Locations of interest" deferred to #85: documented in spec + PR body ✓

**Placeholder scan:** no TBDs, no generic phrases. Every code step shows complete code.

**Type consistency:**
- `DEFAULT_STATION_ADDRESS` defined and exported in Task 2; the test imports it.
- `getStationAddress` / `setStationAddress` signatures match between Task 2 definition and Tasks 3/4 imports.
- API response shapes (`{ stationAddress }` for GET/PUT, `{ updated, failed, skipped, total }` for recompute) match between Task 4 server code and Task 5 client + test mocks.
- `aria-label="Station address"` matches the test's `getByLabelText(/Station address/i)` query.

No gaps.
