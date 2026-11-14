---
paths:
  - "**/__tests__/**"
  - "vitest.config.mts"
  - "src/test-setup.ts"
  - "src/test-global-setup.ts"
  - "e2e/**"
  - "playwright.config.ts"
---

# Tests

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/tests.md](../../docs/agents/tests.md); read it before a non-trivial change here.

- **Vitest, not Jest.** Config `vitest.config.mts`; tests in co-located `__tests__/`. `npm test`, `npm run test:watch`; CI runs `npm run test:coverage`, `npm run typecheck` (catches type errors in `__tests__/`, which `next build` skips) and lint.
- **Each test file gets its own database**, copied from a template migrated once (`src/test-global-setup.ts`, `src/test-setup.ts`). Do not key it on `VITEST_WORKER_ID`; globalSetup uses `applyMigrations`, not `runMigrations`.
- **`asyncUtilTimeout` stays at 1000ms. If a test flakes, do not raise it** — find what the assertion races. Banned shapes: waiting on the DOM while asserting on a value set in a `useEffect`; `getByRole` on anything that opens asynchronously (use `findByRole`); `findBy*` for things that appear after IndexedDB calls (await the page's own calls, as `share-intake.test.tsx` does); typing long values (paste them).
- **Coverage floors** (lines/statements 80, functions 78, branches 75) apply to every `src/**/*.{ts,tsx}` file, so an untested new file counts. Exclusions are fixed (shadcn `ui/`, `schema.ts`, the test harness, `src/types/**`, `*.d.ts`, `__tests__/`); do not add more, and do not reach for `coverage.all`.
- **E2E (`e2e/`, Playwright, real Stripe test API) is not in `npm test` or CI**; specs skip without a `sk_test_` key. Read `e2e/README.md` before adding one.
- Test key pairs come from the pool (`takeMemberKeypair()`), never the RSA generator.
