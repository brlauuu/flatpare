# Security & dependency notes

## Pinned major versions awaiting upstream

### eslint stays on 9 (10 breaks eslint-config-next)

`eslint@10.3.0` is current, but bumping breaks `eslint-config-next@16.2.6` because the bundled `eslint-plugin-react` calls the now-removed `context.getFilename()` API.

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
```

**Re-check trigger:** new `eslint-config-next` release that ships an `eslint-plugin-react` compatible with the eslint 10 rule API.

## Accepted npm audit advisories

This section lists `npm audit` advisories that have been intentionally left unfixed, with rationale. Re-evaluate on every dependency bump and when upstream patches are released.

Last reviewed: 2026-05-09 (issue #132).



### esbuild ≤0.24.2 — GHSA-67mh-4wv8-2f99 (moderate, dev-only)

> esbuild enables any website to send any requests to the development server and read the response.

**Path:** `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild`.

**Why we accept:** Latest stable `drizzle-kit` (0.31.10) still depends on the `@esbuild-kit/*` chain. There is no published version that drops it; the migration is in progress upstream. The vulnerability requires an attacker to reach a developer's local esbuild dev server, which we never run — `drizzle-kit` only invokes esbuild inline during `db:generate` / `db:push` / `db:studio`.

**Re-check trigger:** drizzle-kit 1.x stable release (currently in beta/rc).

### postcss <8.5.10 — GHSA-qx2v-qp2m-jg93 (moderate, build-only)

> PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output.

**Path:** `next → postcss` (the copy bundled inside next, not our top-level postcss which is patched).

**Why we accept:** `npm audit fix --force` would downgrade `next` to `9.3.3` (an 8-year-old release). The advisory only fires when CSS containing attacker-controlled input is round-tripped through postcss's stringifier — we don't do that anywhere. Waiting for Next.js to bump its bundled postcss.

**Re-check trigger:** Next.js patch release that bumps the bundled postcss to ≥ 8.5.10.
