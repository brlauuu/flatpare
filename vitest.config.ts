import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globalSetup: ["./src/test-global-setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      exclude: [
        // shadcn-generated primitives — vendored, re-emitted by the CLI;
        // testing them adds noise without signal.
        "src/components/ui/**",
        // Drizzle schema is pure table/column declarations. Coverage %
        // is misleading: 100% branches, but ~30% lines are untested
        // because there's nothing executable to assert.
        "src/lib/db/schema.ts",
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
});
