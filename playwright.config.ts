import { defineConfig } from "playwright/test";

// End-to-end tests. NOT part of `npm test` and NOT run in CI — see e2e/README.md.
//
// These exist for one reason: the unit tests mock `checkout.sessions.create`,
// so they accept any session shape at all. Three real defects shipped past them
// and were only caught by a hand-run checkout against the live Stripe API
// (#238). This suite is that hand-run test, committed.
//
// It therefore talks to the real Stripe test API and needs a real
// `sk_test_...` key. Without one every spec skips rather than fails, so
// running `npm run test:e2e` unconfigured is a no-op, not a red build.
export default defineConfig({
  testDir: "./e2e",
  // Serial: the specs share one household in one database, and the purchase in
  // the last spec changes what the first one asserts.
  workers: 1,
  fullyParallel: false,
  // A live API call plus a dev-server cold start is slower than a unit test.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // `dev`, not `build && start`: this is a developer-run check, and the
    // extra minute of build time buys nothing the dev server does not show.
    command: "npm run dev",
    url: "http://localhost:3002",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // An explicitly EMPTY value, not an absent one: src/lib/db/target.ts
      // decides on truthiness, so anything else here would point the suite at
      // whatever `.env.local` holds — in this repo's case, production.
      TURSO_DATABASE_URL: "",
      LOCAL_DB_URL: "file:./data/e2e.db",
      // Off, so /apartments is reachable without driving passphrase setup
      // through the browser. This suite is about billing; E2 has its own
      // tests. The mode is stamped on first boot, so data/e2e.db must be
      // deleted if this ever changes.
      FLATPARE_ENCRYPTION: "off",
      APP_PASSWORD: process.env.E2E_APP_PASSWORD ?? "e2e-password",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-insecure-secret-for-local-testing-only",
      // The one value that must be real. Everything else above is local.
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
      // We sign our own events, so this is a shared secret between the suite
      // and the server rather than anything Stripe issued.
      STRIPE_WEBHOOK_SECRET: process.env.E2E_WEBHOOK_SECRET ?? "whsec_e2e_local",
    },
  },
});
