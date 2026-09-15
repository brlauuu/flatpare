# End-to-end tests

**Not run by `npm test`, and not run in CI.** These need a real Stripe test key and a
browser, and CI has neither. Run them by hand when touching billing.

```bash
npx playwright install chromium     # once
STRIPE_SECRET_KEY=sk_test_... \
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... \
npm run test:e2e
```

Without a `sk_test_...` key every spec **skips**. That is deliberate: a red suite for a
missing optional credential trains people to ignore the suite.

## Why this exists

The unit tests mock `checkout.sessions.create`, so they accept any session shape at
all. Three defects shipped straight past them and were caught only by a hand-run
checkout against the live Stripe API ([#238](https://github.com/brlauuu/flatpare/issues/238)):

1. a missing product `tax_code` — the API rejected the session outright;
2. `ui_mode: "embedded"`, which Stripe retired in favour of `"embedded_page"`;
3. VAT added **on top** of the price, billing CHF 6.15 against a page selling CHF 5.

All three were cases where Stripe's answer differed from what the code assumed, which
is exactly the class of bug a mock cannot catch. This suite is that hand-run test,
committed, so the next such regression is caught by running a command rather than by a
customer.

`billing.spec.ts` therefore creates a session against the **real** Stripe test API and
asserts on what Stripe actually created — `amount_total` is 500, `tax_behavior` is
inclusive, `mode` is `payment` — rather than on what we sent.

## What it does not cover

**Entering a card in Stripe's iframe.** Completing a real payment means `stripe listen`
forwarding an event from Stripe's infrastructure, which makes the suite depend on an
external process and a network round trip that cannot be made deterministic.

Instead the `checkout.session.completed` webhook is delivered by the test, signed with
the same secret the server verifies against. Everything the application owns runs for
real — the signature check, the raw-body read, the ledger's event-id idempotency, the
credit grant, the status poll and the navigation back into the app. Only Stripe's own
card form is out of frame.

## Environment

Set by `playwright.config.ts` unless overridden; only the first is required.

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | **Must be real** (`sk_test_...`). Everything else is local. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...`, for the embedded form to render. |
| `E2E_APP_PASSWORD` | Defaults to `e2e-password`. |
| `E2E_WEBHOOK_SECRET` | Defaults to `whsec_e2e_local` — shared between the suite and the server, not issued by Stripe. |

The suite runs against `data/e2e.db` with `FLATPARE_ENCRYPTION=off`, so `/apartments`
is reachable without driving passphrase setup through the browser. The mode is stamped
on first boot, so **delete `data/e2e.db` if that ever changes**. It never touches the
dev or production database — `playwright.config.ts` sets `TURSO_DATABASE_URL` to an
explicitly empty value, which is what `src/lib/db/target.ts` needs to ignore
`.env.local`.

Specs run serially against one household, because the purchase in the last spec
changes what the first one asserts.
