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
