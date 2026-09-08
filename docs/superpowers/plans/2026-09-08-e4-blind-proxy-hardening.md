# E4 — Blind-Proxy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/process/*` safe to expose to open registration — no plaintext in logs on any path, no unbounded spend of the host's API keys, and no arbitrary outbound fetch.

**Architecture:** E3 already delivered the structural half of E4 — the four endpoints live under `/api/process/*`, are blind proxies, write nothing, and each carries the privacy-exception comment. What is left is hardening the edges: a per-household fixed-window rate limiter backed by a new table (there is no Redis in this stack, and Turso is already the durable store), a scrubbing layer over the two places that log request-derived text, and an SSRF belt around the one endpoint that fetches a user-supplied URL. Two unrelated deferred items (#207, and the missing landing-page copy) ride along because they are small and touch the same files.

**Tech Stack:** Next.js 16 route handlers, Drizzle + libSQL, Vitest, Node `dns/promises`.

**Spec:** `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md` (§ "E4 — Blind-proxy processing", lines 131–143)

## Global Constraints

Copied verbatim from the spec, § E4:

- "No request or response bodies in logs, on any code path, including errors."
- "No persistence of plaintext at any layer, including caches."
- "Rate limited per account — these endpoints spend the host's money."
- "The privacy exception documented at the endpoint and on the landing page."

Plus the repo's standing rules that this epic must not regress:

- **Unset env var means unlimited.** The self-hoster's `docker compose up` default must not start refusing requests. Rate limits are opt-in; the hosted deployment sets them.
- Every `/api/process/*` handler stays `requireMember()` → `parseBody` → work, and writes **no** table.
- `npm run typecheck`, `npm test`, and `enola check --fail-on=cycles` must all pass before each commit.
- Nothing under `src/lib/` may import from `@/components`.

## Issues closed

| Issue | Task |
|---|---|
| #186 — E4 blind-proxy endpoints | Tasks 1–5 |
| #199 — Blind SSRF in `checkListingUrl` | Task 1 |
| #207 — Widen the residual-encoding belt to `%5c` | Task 5 |

## Starting state (verified 2026-09-08, commit `a7dd637`)

Do not re-derive these; they were checked by hand while writing this plan.

- `src/app/api/process/{check-listing,distance,geocode,parse-pdf}/route.ts` exist, all call `requireMember()`, none writes a table, each has a privacy comment.
- **Leak 1:** `src/lib/geocode.ts:89` logs the full plaintext address — `` console.error(`[geocode:google] no result for "${address}" — ${reason}`) ``. This is a direct violation of the first Global Constraint.
- **Leak 2:** `src/lib/api-route.ts:27` is `` console.error(`[${tag}]`, err) `` — it dumps the whole error object. For a geocode failure the thrown error can carry the outbound URL, whose query string holds **both** the plaintext address and `GOOGLE_MAPS_API_KEY`.
- `src/lib/parse-pdf` route already scrubs correctly (classified reason + status only) — leave it alone, and copy its shape.
- **SSRF:** `src/lib/listing-status.ts:33` `checkListingUrl` — no scheme allowlist, `redirect: "follow"`, no private-range block, 10s timeout.
- **#207's real location** is `src/lib/storage.ts:30` (`/%2f/i` in `householdIdFromStoredPath`), *not* `src/lib/pathname.ts` as the issue text says. `pathname.ts`'s `hasResidualPercentEncoding` already rejects any `%` and needs no change.
- No rate limiting of any kind exists. The old `api_usage` table was dropped by migration 0012 and is not coming back in this shape.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/safe-url.ts` | **Create.** Pure + DNS: scheme allowlist, private/link-local range predicate, `assertPublicHttpUrl(url)`. No app imports. |
| `src/lib/listing-status.ts` | **Modify.** Manual redirect walk, each hop re-validated through `safe-url`. |
| `src/lib/log-scrub.ts` | **Create.** `scrubbedErrorLine(err)` — error class + status only, never message, never URL. Zero imports. |
| `src/lib/geocode.ts` | **Modify.** Drop the address from the log line (`:89`). |
| `src/lib/api-route.ts` | **Modify.** `apiErrorResponse` scrubs when the tag starts with `process:`. |
| `src/lib/rate-limit.ts` | **Create.** Fixed-window counter over the new table; reads limits from env. |
| `src/lib/db/schema.ts` + `drizzle/0016` | **Modify/Create.** `process_usage` table. |
| `src/app/api/process/*/route.ts` | **Modify.** One `await consumeRateLimit(householdId, "<endpoint>")` line each. |
| `src/lib/storage.ts` | **Modify.** `/%2f|%5c/i`. |
| `src/app/page.tsx`, `docs/security-notes.md`, `AGENTS.md` | **Modify.** The documented exception. |

---

### Task 1: SSRF belt around the listing probe (#199)

**Files:**
- Create: `src/lib/safe-url.ts`
- Create: `src/lib/__tests__/safe-url.test.ts`
- Modify: `src/lib/listing-status.ts`
- Test: `src/lib/__tests__/listing-status.test.ts` (exists — extend)

**Interfaces:**
- Produces: `isPrivateAddress(ip: string): boolean`, `assertPublicHttpUrl(raw: string): Promise<URL>` (throws `UnsafeUrlError`), `class UnsafeUrlError extends Error`.
- Consumes: nothing from other tasks.

**Why manual redirects:** `redirect: "follow"` validates only the first URL. A public host that 302s to `http://169.254.169.254/` defeats a check done before the fetch, so each hop must be re-validated. Cap at 5 hops.

**Known residual, to be documented not solved:** DNS rebinding between the `lookup` and the `fetch` (TOCTOU). Pinning the connection to the resolved IP needs a custom agent and breaks TLS SNI/vhosts. Out of scope; goes in `docs/security-notes.md` as an accepted limit.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/safe-url.test.ts
import { describe, it, expect } from "vitest";
import { isPrivateAddress, assertPublicHttpUrl, UnsafeUrlError } from "../safe-url";

describe("isPrivateAddress", () => {
  it("flags the ranges an SSRF probe would aim at", () => {
    for (const ip of [
      "127.0.0.1", "10.0.0.1", "172.16.0.1", "172.31.255.255",
      "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1",
      "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects a non-http scheme", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl("gopher://x/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a literal private host without touching DNS", async () => {
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      UnsafeUrlError
    );
    await expect(assertPublicHttpUrl("http://127.0.0.1:8080/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a hostname that resolves into a private range", async () => {
    const lookup = async () => [{ address: "10.1.2.3", family: 4 }];
    await expect(assertPublicHttpUrl("http://internal.example.com/", lookup)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it("returns the parsed URL for a public host", async () => {
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const url = await assertPublicHttpUrl("https://example.com/ad/1", lookup);
    expect(url.hostname).toBe("example.com");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/__tests__/safe-url.test.ts`
Expected: FAIL — `Failed to resolve import "../safe-url"`.

- [ ] **Step 3: Write `src/lib/safe-url.ts`**

```ts
import { lookup as dnsLookup } from "node:dns/promises";

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnsafeUrlError";
  }
}

export type LookupFn = (host: string) => Promise<Array<{ address: string; family: number }>>;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// [first, last] inclusive, as 32-bit ints.
const V4_BLOCKED: Array<[string, string]> = [
  ["0.0.0.0", "0.255.255.255"],       // "this network"
  ["10.0.0.0", "10.255.255.255"],     // RFC1918
  ["100.64.0.0", "100.127.255.255"],  // CGNAT
  ["127.0.0.0", "127.255.255.255"],   // loopback
  ["169.254.0.0", "169.254.255.255"], // link-local (cloud metadata)
  ["172.16.0.0", "172.31.255.255"],   // RFC1918
  ["192.0.0.0", "192.0.0.255"],       // IETF protocol assignments
  ["192.168.0.0", "192.168.255.255"], // RFC1918
  ["198.18.0.0", "198.19.255.255"],   // benchmarking
  ["224.0.0.0", "255.255.255.255"],   // multicast + reserved + broadcast
];

export function isPrivateAddress(ip: string): boolean {
  const bare = ip.trim().replace(/^\[|\]$/g, "");

  // IPv4-mapped IPv6 ("::ffff:127.0.0.1") must be judged as its IPv4 half.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
  if (mapped) return isPrivateAddress(mapped[1]);

  const v4 = ipv4ToInt(bare);
  if (v4 !== null) {
    return V4_BLOCKED.some(([lo, hi]) => {
      const l = ipv4ToInt(lo)!;
      const h = ipv4ToInt(hi)!;
      return v4 >= l && v4 <= h;
    });
  }

  const v6 = bare.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // unique local fc00::/7
  return false;
}

export async function assertPublicHttpUrl(
  raw: string,
  lookup: LookupFn = (host) => dnsLookup(host, { all: true })
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("not a URL");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError("scheme not allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  // A literal IP never reaches DNS, so check it directly first.
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("private address");
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host);
  } catch {
    throw new UnsafeUrlError("host did not resolve");
  }
  if (addresses.length === 0) throw new UnsafeUrlError("host did not resolve");
  // Every answer must be public: a round-robin with one private answer is
  // still a usable oracle.
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError("private address");
  }
  return url;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/__tests__/safe-url.test.ts`
Expected: PASS (4 + 2 assertions groups).

- [ ] **Step 5: Write the failing test for the redirect walk**

Append to `src/lib/__tests__/listing-status.test.ts`:

```ts
describe("checkListingUrl SSRF belt", () => {
  it("refuses a private URL without fetching", async () => {
    const fetchImpl = vi.fn();
    expect(await checkListingUrl("http://169.254.169.254/", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-http scheme without fetching", async () => {
    const fetchImpl = vi.fn();
    expect(await checkListingUrl("file:///etc/passwd", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not follow a redirect into a private address", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1:9200/" } })
    );
    expect(await checkListingUrl("https://example.com/ad/1", fetchImpl)).toBeNull();
    // The first hop was fetched; the second was refused before any request.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still reports a public 404 as gone", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    expect(await checkListingUrl("https://example.com/ad/1", fetchImpl)).toBe(true);
  });
});
```

Note: these tests must inject a lookup that returns a public address for `example.com`. Add an optional third parameter to `checkListingUrl` for that, defaulting to the real resolver.

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run src/lib/__tests__/listing-status.test.ts`
Expected: FAIL — the private URL is currently fetched.

- [ ] **Step 7: Rewrite `checkListingUrl`'s fetch loop**

Replace the `try` block body with a manual redirect walk: `redirect: "manual"`, at most `MAX_REDIRECTS = 5` hops, resolving each `location` against the current URL and passing it back through `assertPublicHttpUrl` before the next request. Keep the existing `urlIndicatesExpired` checks on both the input and the final URL, keep the HEAD→GET fallback, keep the 10s `AbortController`, and keep returning `null` for every failure (`UnsafeUrlError` included) so the tri-state contract is unchanged.

- [ ] **Step 8: Run the full lib suite**

Run: `npx vitest run src/lib/__tests__/`
Expected: PASS, no regressions in `listing-status.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/safe-url.ts src/lib/__tests__/safe-url.test.ts src/lib/listing-status.ts src/lib/__tests__/listing-status.test.ts
git commit -m "fix: block SSRF in the listing probe (#199)"
```

---

### Task 2: Stop logging request-derived text

**Files:**
- Create: `src/lib/log-scrub.ts`
- Create: `src/lib/__tests__/log-scrub.test.ts`
- Modify: `src/lib/geocode.ts:88-91`, `src/lib/api-route.ts:27`
- Test: `src/lib/__tests__/geocode.test.ts` (exists — extend), `src/lib/__tests__/api-route.test.ts` (exists — extend)

**Interfaces:**
- Produces: `scrubbedErrorLine(err: unknown): string` — returns `"<ErrorName> status=<n>"` or `"<ErrorName>"`, never a message, never a URL.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/log-scrub.test.ts
import { describe, it, expect } from "vitest";
import { scrubbedErrorLine } from "../log-scrub";

describe("scrubbedErrorLine", () => {
  it("names the error class and nothing else", () => {
    expect(scrubbedErrorLine(new TypeError("fetch failed for https://x/?address=Bahnhofstrasse+1&key=SECRET")))
      .toBe("TypeError");
  });

  it("keeps a numeric status, which carries no request content", () => {
    const err = Object.assign(new Error("boom"), { status: 429 });
    expect(scrubbedErrorLine(err)).toBe("Error status=429");
  });

  it("never returns the message for a non-Error", () => {
    expect(scrubbedErrorLine("Bahnhofstrasse 1")).toBe("NonError");
  });
});
```

And in `src/lib/__tests__/geocode.test.ts`:

```ts
it("does not log the address when the geocoder finds nothing", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  // ...arrange a no-result response for "Bahnhofstrasse 1, Zurich"...
  await geocodeLatLngWithReason("Bahnhofstrasse 1, Zurich");
  for (const call of spy.mock.calls) {
    expect(JSON.stringify(call)).not.toContain("Bahnhofstrasse");
  }
  spy.mockRestore();
});
```

And in `src/lib/__tests__/api-route.test.ts`:

```ts
it("logs a process-route 500 without the error message or URL", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const err = new TypeError("fetch failed: https://maps.googleapis.com/?address=Bahnhofstrasse+1&key=SECRET");
  apiErrorResponse(err, "process:geocode");
  const logged = JSON.stringify(spy.mock.calls);
  expect(logged).not.toContain("Bahnhofstrasse");
  expect(logged).not.toContain("SECRET");
  expect(logged).toContain("TypeError");
  spy.mockRestore();
});

it("still logs the full error for a non-process route", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  apiErrorResponse(new Error("ordinary failure"), "apartments:create");
  expect(JSON.stringify(spy.mock.calls)).toContain("ordinary failure");
  spy.mockRestore();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/__tests__/log-scrub.test.ts src/lib/__tests__/geocode.test.ts src/lib/__tests__/api-route.test.ts`
Expected: FAIL — module missing; the address and the message are currently logged.

- [ ] **Step 3: Write `src/lib/log-scrub.ts`**

```ts
// A log line for an error that may have touched request content. Under E4
// the /api/process/* endpoints see plaintext the user submitted, and an
// error thrown from an outbound fetch routinely carries the request URL —
// whose query string holds both the plaintext address and the API key. The
// error's CLASS and a numeric status are enough to debug a proxy failure
// and are the only two fields provably free of request-derived text.
export function scrubbedErrorLine(err: unknown): string {
  if (!(err instanceof Error)) return "NonError";
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? `${err.name} status=${status}` : err.name;
}
```

- [ ] **Step 4: Fix the two leaks**

In `src/lib/geocode.ts`, replace the `no result for "${address}"` line with one that names no input:

```ts
console.error(`[geocode:google] no result — ${reason}`);
```

(`reason` is Google's `status` plus its `error_message`, which is provider-side text about the request's *outcome*, not an echo of the address. If a future provider starts echoing input there, this line is the one to revisit.)

In `src/lib/api-route.ts`, make the 500 log scrub for process tags:

```ts
console.error(
  tag.startsWith("process:") ? `[${tag}] ${scrubbedErrorLine(err)}` : `[${tag}]`,
  ...(tag.startsWith("process:") ? [] : [err])
);
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/lib/__tests__/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/log-scrub.ts src/lib/__tests__/log-scrub.test.ts src/lib/geocode.ts src/lib/api-route.ts src/lib/__tests__/geocode.test.ts src/lib/__tests__/api-route.test.ts
git commit -m "fix: keep request-derived text out of process-route logs (#186)"
```

---

### Task 3: Per-household rate limiting

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0016_process_usage.sql` (via `npx drizzle-kit generate --name=process_usage`)
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/__tests__/rate-limit.test.ts`
- Modify: all four `src/app/api/process/*/route.ts`
- Test: `src/lib/db/__tests__/migrate.test.ts` (extend)

**Interfaces:**
- Produces: `consumeRateLimit(householdId: number, endpoint: ProcessEndpoint): Promise<void>` (throws `ApiError("Rate limit exceeded", 429)`), `type ProcessEndpoint = "geocode" | "distance" | "check-listing" | "parse-pdf"`, `processRateLimitPerHour(): number | null`.
- Consumes: `ApiError` from `@/lib/api-error`.

**Design:** fixed window, one hour, one row per `(household_id, endpoint, window_start)`. Fixed rather than sliding because the point is bounding spend, not smoothing traffic, and a fixed window is one atomic upsert:

```sql
INSERT INTO process_usage (household_id, endpoint, window_start, count)
VALUES (?, ?, ?, 1)
ON CONFLICT (household_id, endpoint, window_start)
DO UPDATE SET count = count + 1
RETURNING count
```

**This is not "persisting plaintext."** The table stores a household id, an endpoint name, an hour, and an integer — no request content. Say so in the migration comment, because the second Global Constraint invites exactly that misreading.

**Env:** `PROCESS_RATE_LIMIT_PER_HOUR`. **Unset or empty means unlimited** and `consumeRateLimit` returns without touching the database — the self-hoster default. A non-numeric or negative value fails fast at first use with a named error, matching `readEncryptionMode`'s posture.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/rate-limit.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { processUsage } from "@/lib/db/schema";
import { consumeRateLimit } from "../rate-limit";

const ORIGINAL = process.env.PROCESS_RATE_LIMIT_PER_HOUR;
beforeEach(async () => { await db.delete(processUsage); });
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
  else process.env.PROCESS_RATE_LIMIT_PER_HOUR = ORIGINAL;
});

describe("consumeRateLimit", () => {
  it("is a no-op when the limit is unset (the self-hoster default)", async () => {
    delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
    for (let i = 0; i < 50; i++) await consumeRateLimit(1, "geocode");
    expect(await db.select().from(processUsage)).toHaveLength(0);
  });

  it("allows exactly the configured number of calls, then throws 429", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "3";
    for (let i = 0; i < 3; i++) await consumeRateLimit(1, "geocode");
    await expect(consumeRateLimit(1, "geocode")).rejects.toMatchObject({ status: 429 });
  });

  it("counts each endpoint separately", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "1";
    await consumeRateLimit(1, "geocode");
    await expect(consumeRateLimit(1, "geocode")).rejects.toMatchObject({ status: 429 });
    await expect(consumeRateLimit(1, "distance")).resolves.toBeUndefined();
  });

  it("counts each household separately", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "1";
    await consumeRateLimit(1, "geocode");
    await expect(consumeRateLimit(2, "geocode")).resolves.toBeUndefined();
  });

  it("stores no request content — only ids, an endpoint name, an hour and a count", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "5";
    await consumeRateLimit(1, "geocode");
    const [row] = await db.select().from(processUsage);
    expect(Object.keys(row).sort()).toEqual(
      ["count", "endpoint", "householdId", "windowStart"].sort()
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/__tests__/rate-limit.test.ts`
Expected: FAIL — `processUsage` is not exported from the schema.

- [ ] **Step 3: Add the table, generate the migration, write the limiter**

Schema addition (`src/lib/db/schema.ts`):

```ts
// E4 rate limiting. Deliberately holds NO request content: a household id,
// an endpoint name, the hour bucket, and a count. See docs/security-notes.md.
export const processUsage = sqliteTable(
  "process_usage",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.endpoint, t.windowStart] })]
);
```

Then `npx drizzle-kit generate --name=process_usage`.

`src/lib/rate-limit.ts` implements `processRateLimitPerHour()` (parse env once per call, `null` when unset/empty, throw on invalid) and `consumeRateLimit()` using the upsert above via `db.run(sql\`...\`)`, comparing the returned count against the limit and throwing `new ApiError("Rate limit exceeded", 429)` when it exceeds.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/lib/__tests__/rate-limit.test.ts src/lib/db/__tests__/migrate.test.ts`
Expected: PASS. Add a `migrate.test.ts` case asserting `process_usage` exists on a fresh database with those four columns.

- [ ] **Step 5: Wire it into the four routes**

One line in each handler, immediately after `requireMember()`:

```ts
const { householdId } = await requireMember();
await consumeRateLimit(householdId, "geocode");
```

`check-listing`, `distance` and `parse-pdf` take their own endpoint names. Note `parse-pdf`'s handler currently discards the `requireMember()` return — it must now capture it.

- [ ] **Step 6: Run the route tests**

Run: `npx vitest run src/app/api/process/`
Expected: PASS. Existing route tests run with the env var unset, so the limiter is a no-op there and nothing should change.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts drizzle/ src/lib/rate-limit.ts src/lib/__tests__/rate-limit.test.ts src/app/api/process src/lib/db/__tests__/migrate.test.ts
git commit -m "feat: per-household rate limits on the process proxies (#186)"
```

---

### Task 4: Assert the negatives, end to end

**Files:**
- Create: `src/app/api/process/__tests__/no-leak.test.ts`

The spec asks for tests that "assert the negative: no handler writes plaintext to the database or the logs." Row-count assertions already exist per route; what is missing is the log half and a single sweep.

- [ ] **Step 1: Write the test**

For each of the four routes, drive one success and one failure path with a distinctive plaintext marker (`"Bahnhofstrasse 1, 8001 Zurich"`, `"https://example.com/secret-listing-42"`), with `console.error`/`console.warn`/`console.log` spied, and assert:

1. The marker appears in **no** console call.
2. `GOOGLE_MAPS_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` values appear in no console call.
3. Every table's row count is unchanged (`apartments`, `ratings`, `locations`, `process_usage` when the limit is unset).

- [ ] **Step 2: Run it**

Run: `npx vitest run src/app/api/process/__tests__/no-leak.test.ts`
Expected: PASS once Tasks 1–3 are in. **If it fails, that is a real finding — fix the leak, not the test.**

- [ ] **Step 3: Commit**

```bash
git add src/app/api/process/__tests__/no-leak.test.ts
git commit -m "test: assert no plaintext reaches logs or tables from /api/process (#186)"
```

---

### Task 5: Widen the residual-encoding belt (#207)

**Files:**
- Modify: `src/lib/storage.ts:30`
- Test: `src/lib/__tests__/storage-scoping.test.ts` (exists — extend)

The issue names `src/lib/pathname.ts`; the check actually lives in `src/lib/storage.ts:30` (`householdIdFromStoredPath`). `pathname.ts`'s `hasResidualPercentEncoding` already rejects **any** `%` and needs no change — record that in the commit message so the discrepancy isn't rediscovered.

- [ ] **Step 1: Write the failing test**

```ts
it("rejects an encoded backslash in a filename segment", () => {
  expect(householdIdFromStoredPath("households/7/a%5cb.pdf")).toBeNull();
  expect(householdIdFromStoredPath("households/7/a%5Cb.pdf")).toBeNull();
});

it("still accepts an ordinary filename", () => {
  expect(householdIdFromStoredPath("households/7/report final.pdf")).toBe(7);
});
```

- [ ] **Step 2: Run it and watch the first case fail**

Run: `npx vitest run src/lib/__tests__/storage-scoping.test.ts`
Expected: FAIL — `%5c` currently returns `7`.

- [ ] **Step 3: Widen the pattern**

`if (segments.slice(2).some((s) => /%2f|%5c/i.test(s))) return null;`

- [ ] **Step 4: Run and pass**, then **Step 5: Commit**

```bash
git commit -am "fix: reject encoded backslashes in stored paths (#207)"
```

---

### Task 6: Document the exception where users can see it

**Files:**
- Modify: `src/app/page.tsx`, `docs/security-notes.md`, `AGENTS.md`

- [ ] **Step 1: Landing page copy**

The spec requires the exception "on the landing page". Add a short, plain-language section to `src/app/page.tsx` — what the four features send to the server, that it is used for one call and not stored, and that everything else is encrypted before it leaves the browser. No marketing language; this is the one place the crypto story admits its limit.

- [ ] **Step 2: `docs/security-notes.md`**

Add: the DNS-rebinding TOCTOU residual from Task 1; the fact that `process_usage` holds no request content; that `reason` strings from Google/ORS are provider outcome text and are returned to the client and logged.

- [ ] **Step 3: `AGENTS.md`**

Update the Data (E3) section's `/api/process/*` bullet with the rate limiter, `PROCESS_RATE_LIMIT_PER_HOUR` (unset = unlimited), and the scrubbing rule for `process:` tags. Add `PROCESS_RATE_LIMIT_PER_HOUR` to the "Cloud-mode env vars" list. Add migration 0016 to the Database section.

- [ ] **Step 4: Full verification and commit**

```bash
npm run typecheck && npm test && npx eslint . && enola check --fail-on=cycles
git commit -am "docs: the blind-proxy privacy exception and its limits (#186)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| No request/response bodies in logs, any path incl. errors | 2, verified by 4 |
| No plaintext persisted at any layer, caches included | 4 (row-count sweep); no cache is introduced |
| Rate limited per account | 3 |
| Exception documented at the endpoint and on the landing page | 6 (endpoint comments already exist from E3) |
| Reuse existing parse-pdf/geocode/distance/check-listing logic | All — no extraction rewrites |

**Gap accepted deliberately:** the spec's "including caches" has no corresponding code change because no layer caches these responses today. Task 4's row-count sweep is what would catch a future one.

**Type consistency:** `ProcessEndpoint` (Task 3) is the only shared type; the four literals match the four route directory names exactly. `UnsafeUrlError` (Task 1) is caught only inside `checkListingUrl`, which keeps returning `boolean | null`, so no caller signature changes.

**Ordering:** Tasks 1, 2, 3 and 5 are independent. Task 4 must run last of 1–4. Task 6 depends on 1–3 for accuracy.
