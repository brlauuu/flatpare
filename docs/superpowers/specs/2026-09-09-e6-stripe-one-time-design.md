# E6 — Stripe one-time purchase and the apartment quota

**Status:** design, pending provisioning. Nothing here is implemented.

**Issue:** [#188](https://github.com/brlauuu/flatpare/issues/188)

**Parent spec:** [2026-09-01-accounts-e2ee-billing-design.md](./2026-09-01-accounts-e2ee-billing-design.md) — its E6 section is **superseded**; see below.

---

## What changed from the parent spec

The parent spec's E6 says:

> Stripe Checkout for upgrade, the Customer Portal for cancellation and card
> changes, and a signed webhook that flips the account's tier.
> […] Billing metadata (customer id, subscription id, tier, period end)

That describes a **subscription**. The model is now a **one-time purchase**, decided 2026-09-09. Concretely:

| Parent spec | Now |
|---|---|
| Subscription, recurring | **One-time payment, $5** |
| Free tier + paid tier | **No free tier.** One offering |
| Tier flip on webhook | **Quota grant** on webhook, cumulative |
| Customer Portal for cancellation | **Not needed** — nothing recurs |
| `subscription id`, `period end` | Not stored. There is no period |
| 5/20 free, 10/100 paid | **10 seats, 40 apartments**, +40 per additional $5 |

What survives unchanged, and is the most important sentence in the parent spec:

> The webhook is the only source of truth for entitlement — never the client,
> and never the redirect back from Checkout.

And:

> Billing metadata is **not** encrypted: the server must read it to enforce
> limits, and it is the host's commercial record rather than the user's
> private data.

Both still hold.

## The offering

- **$5, once.** Grants a household **40 apartment credits**.
- **10 seats** (`MAX_MEMBERS`, already implemented in E5).
- **40 active apartments** (`MAX_APARTMENTS`, already implemented in E5).
- Another **$5 grants another 40 credits**. Credits accumulate; the active cap does not move.
- **Self-hosted: no quota, no credits, no billing.** Unset means unlimited, exactly as E5 established.

### Credits are consumed by *adding*, not by *holding*

This is the load-bearing distinction and the one most likely to generate a complaint, so it is stated on the landing page already (#231, with a test):

> The 40 counts apartments you **add**, not apartments you keep: deleting one
> frees room in your comparison but does not give the credit back.

The reason is cost, not policy: adding an apartment spends real money on PDF extraction, geocoding and distance calls. Holding one costs a few hundred bytes of ciphertext.

**E5 does not implement this.** `createApartmentRow` counts current rows:

```sql
SELECT COUNT(*) FROM apartments WHERE household_id = ?
```

so delete-and-re-add resets the count today. The quota needs a counter that **never decreases**.

## Data model

Two new pieces of state, both plaintext, both the host's commercial record.

### `households` gains a credit ledger summary

```
apartment_credits_granted  integer NOT NULL DEFAULT 0   -- sum of purchases
apartments_ever_added      integer NOT NULL DEFAULT 0   -- monotonic, never decremented
```

Enforcement in `createApartmentRow` becomes two checks:

1. `activeCount < MAX_APARTMENTS` — the E5 check, unchanged.
2. `apartments_ever_added < apartment_credits_granted` — the new quota, **only when billing is enabled**.

`apartments_ever_added` is incremented in the same atomic statement that inserts the row, so a concurrent pair cannot both consume the last credit. The E5 conditional-insert pattern extends to it directly:

```sql
INSERT INTO apartments (id, household_id, envelope)
SELECT ?, ?, ?
WHERE (SELECT COUNT(*) FROM apartments WHERE household_id = ?) < ?
  AND (SELECT apartments_ever_added FROM households WHERE id = ?)
      < (SELECT apartment_credits_granted FROM households WHERE id = ?)
```

…followed by the increment. **Open question for the plan:** whether these two statements need a transaction, given #225 (concurrent `db.transaction` on libSQL aborts with `SQLITE_BUSY`). A single `UPDATE … SET apartments_ever_added = apartments_ever_added + 1 WHERE … RETURNING` used as the *gate*, with the insert following, may be the cleaner atomic shape — decide with a concurrency test, as E5 did.

### `payments` — an append-only record of what was bought

```
id                text PRIMARY KEY        -- Stripe event id, for idempotency
household_id      integer NOT NULL
stripe_customer   text
stripe_session    text
amount_cents      integer NOT NULL
currency          text NOT NULL
credits_granted   integer NOT NULL
created_at        integer
```

Keyed on the **Stripe event id** so redelivery is a no-op: Stripe retries webhooks, and at-least-once delivery means a duplicate must not grant 40 credits twice. Insert-or-ignore on the primary key is the whole mechanism.

Append-only: a refund is a new row with negative credits, never an edit. The ledger should reconstruct `apartment_credits_granted` exactly, which makes it auditable against Stripe.

## Flow

1. Member hits the cap. The UI offers **Buy 40 more apartments — $5**.
2. `POST /api/billing/checkout` → `requireMember()` → create a Stripe Checkout Session in **`payment` mode** with the household id in `client_reference_id` (and metadata), return the URL.
3. Browser goes to Stripe. **Nothing is granted here.**
4. Stripe redirects back to `/settings?purchase=complete`. **This is cosmetic only** — it may be forged, arrive early, or never arrive if the user closes the tab. It must never grant anything.
5. Stripe POSTs `checkout.session.completed` to `/api/billing/webhook`. Signature verified against the endpoint secret. Then, idempotently: insert the `payments` row, add 40 to `apartment_credits_granted`.
6. The client polls or refetches; the new balance appears.

### Rules the implementation must hold

- **The webhook is the only writer of credits.** Not the checkout route, not the redirect, not the client.
- **Verify the signature before parsing the body.** An unverified webhook body is attacker-controlled input.
- **Idempotent by event id.** Stripe delivers at least once.
- **The webhook route is unauthenticated by necessity** — Stripe has no session. It must be excluded from `src/proxy.ts`'s gate, and its only authentication is the signature. This is the one route in the app where that is true, and it deserves a comment saying so.
- **The raw body is required** for signature verification. Next.js route handlers must read `await req.text()`, not `req.json()`.
- **No plaintext household data touches this path.** Billing knows a household id, not what is in it.

## Self-hosting

Billing is **off** unless configured, following E5's rule that unset means unlimited:

- No Stripe keys → `POST /api/billing/checkout` returns 404, the webhook route returns 404, the quota check is skipped entirely, and the UI shows no purchase affordance.
- A self-hoster is never told to buy anything, and no code path can refuse their apartment.

This also keeps the O'SAASY position coherent: the source is public and fully functional; the hosted convenience is what is sold.

## Open questions — decide before implementing

### 1. Two spend holes the quota does not close

Measured 2026-09-09 (full numbers on #188):

- **Adding a location re-runs distances for every apartment.** 40 apartments × 2 elements = **$0.40 per location added**, repeatable, consuming no credits.
- **`runMaintenance("distances")` / Reprocess re-run everything.** 40 apartments × 5 locations = 400 elements = **$2.00 per click**, repeatable — which can exceed the margin on the $5 that paid for it.

A per-apartment credit does not bound either. Candidate answers, none chosen:

- Set `PROCESS_RATE_LIMIT_PER_HOUR` (E4, already built, currently unset). Bounds the rate, not the lifetime total. Cheapest and available today.
- Make a credit mean *one paid third-party call* rather than *one apartment*. Accurate; much harder to explain on a pricing page than "40 apartments".
- Charge maintenance against the apartment quota at some ratio.
- Accept it, and watch the numbers while the user base is small.

**Recommendation: set the rate limit now, revisit if real usage shows abuse.** The margin is 51–87% and the failure mode is bounded per hour rather than unbounded.

### 2. Currency and tax

$5 in which currency, and does Stripe Tax need enabling? A Swiss-hosted product selling into the EU has VAT implications that are a decision, not a detail. Not answerable from the code.

### 3. Refunds

Append a negative-credit row, or leave it manual at this volume? Manual is defensible for the first users; the ledger shape above supports either.

### 4. What the user sees when out of credits

A hard block at the cap, or a soft warning at 35 of 40? The latter is friendlier and gives the purchase a natural moment.

## What must be provisioned before implementation

I cannot do any of this — it needs the Vercel and Stripe accounts.

1. **`vercel integration add stripe`** — the parent spec requires the Marketplace integration rather than hand-wiring the SDK. Confirm which env vars it injects and under what names; the implementation should read those rather than invented ones.
2. **A Stripe product and price:** one product, one price, **$5, one-time** (not recurring). Note the price id.
3. **A webhook endpoint** pointed at `https://flatpare.com/api/billing/webhook`, subscribed to `checkout.session.completed` (and `charge.refunded` if refunds are automated). Note the signing secret.
4. **Test mode first.** Everything above in test mode, with the test keys in Preview, before anything touches live keys.
5. Decide the currency, and whether Stripe Tax is on.

Once those exist and the env var names are known, the implementation plan can be written against reality rather than against a guess — which is the same reason E4 and E5 were planned only after reading the code they touched.

## Prerequisite, tracked separately

**#232 — production launch readiness.** `AUTH_SECRET` unset, no OAuth configured, and a pre-E1 database that migrations will refuse to boot against. Billing on top of a deployment nobody can sign into is not useful, so #232 should land first or alongside.
