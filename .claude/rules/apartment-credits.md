---
paths:
  - "src/lib/{billing,billing-gate,stripe,credit-codes}.ts"
  - "src/app/api/billing/**"
  - "src/app/billing/**"
  - "scripts/credit-code.mjs"
  - "src/components/{credit-balance,redeem-credit-code}.tsx"
---

# Apartment credits (E6)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/apartment-credits.md](../../docs/agents/apartment-credits.md); read it before a non-trivial change here.

- **Billing is off unless `STRIPE_SECRET_KEY` is set**; off means no paywall and no counting, **unless `FLATPARE_CREDITS=on`** (#492): credits are then counted without Stripe (`creditsEnabled()` vs `billingEnabled()`), and running out offers a credit code, never a checkout (`purchasable: false`).
- **Credit codes** (`src/lib/credit-codes.ts`, `scripts/credit-code.mjs`): claim, then guarded use, then grant; once per household per code; the code is never echoed or logged.
- Credits are **one shared household pool**: no role check and no per-member budget on spending or buying (decided on #294).
- Two ceilings: `MAX_APARTMENTS` (rows held) and credits (processings ever paid for; `apartments_ever_added` is monotonic, never decremented by delete).
- **`POST /api/billing/webhook` is the only thing that grants credits.** It is unauthenticated by design: read the raw body (`req.text()`), verify the signature first, never mock `constructEvent` in tests. Idempotency is the `payments` primary key (Stripe event id), inserted before granting.
- **The purchase gate keys on `granted === 0`, never `remaining === 0`** — a household that spent its credits still owns its data.
- Stripe: `mode: "payment"`, inline `price_data` (`PRICE_CHF_CENTS` in `src/lib/stripe.ts`), **`ui_mode: "embedded_page"`, not `"embedded"`**. The checkout polls for `granted > grantedAtStart`.
- No rate limit on the hosted deployment, by decision (2026-09-16): an accepted cost, not an oversight. Do not set `PROCESS_RATE_LIMIT_PER_HOUR` or re-raise it without usage data.
