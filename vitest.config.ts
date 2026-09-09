import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globalSetup: ["./src/test-global-setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    // Reset every mock before each test. `clearAllMocks` clears recorded calls
    // but leaves values queued with `mockReturnValueOnce` in place, so a test
    // that over-queues — which happens whenever a mocked chain throws part-way
    // through — silently feeds the surplus to the next test in the file. That
    // corrupted six unrelated assertions during the accounts epic (#201).
    //
    // Consequence to know: a mock's implementation must be set inside
    // `beforeEach` or the test itself, never at its declaration, or the reset
    // wipes it.
    mockReset: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    // File parallelism is back on (#202). The real-database suites used to
    // share one libSQL file and produced SQLITE_BUSY failures that varied run
    // to run, which forced this off and cost ~22s -> ~85s. Each worker now
    // gets its own migrated database (src/test-setup.ts), so the contention
    // is removed rather than avoided.
    coverage: {
      // Count every source file, not only those a test happens to import
      // (#203). Without this, a brand-new file with zero tests contributes
      // nothing to the average and cannot pull it below the floor — the
      // thresholds silently stop protecting exactly the code most likely to
      // be untested.
      //
      // NOTE: `coverage.all` is NOT the knob for this. It was removed in
      // vitest 3, and setting it true or false was measured here to change
      // nothing at all — `include` alone decides what is reported. The issue
      // proposed "coverage.all with an include list"; only the second half
      // does any work.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // shadcn-generated primitives — vendored, re-emitted by the CLI;
        // testing them adds noise without signal.
        "src/components/ui/**",
        // Drizzle schema is pure table/column declarations. Coverage %
        // is misleading: 100% branches, but ~30% lines are untested
        // because there's nothing executable to assert.
        "src/lib/db/schema.ts",
        // The test harness itself: shipped in no bundle, and its correctness
        // is demonstrated by the suite running at all.
        "src/test-setup.ts",
        "src/test-global-setup.ts",
        // Ambient type declarations — no executable code to cover.
        "src/types/**",
        "**/*.d.ts",
        // vitest's defaults (node_modules, dist, etc.) — kept implicit.
      ],
      // Floor — we're well above as of #129; set here so a regression
      // (or a sneaky `if` slipping through without a test) fails CI.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 78,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  ssr: {
    noExternal: ["next-auth", "@auth/core", "@auth/drizzle-adapter"],
  },
});
