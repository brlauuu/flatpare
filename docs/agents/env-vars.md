# Cloud-mode env vars

Full reference. The rules for this area are in `.claude/rules/env-vars.md` (loaded when working on its files), with anything cross-cutting in AGENTS.md; this file holds the detail, the measurements and the history behind them.

Beyond auth + Turso, the following keys gate cloud features. If any is unset, the feature degrades cleanly to manual entry / no-op:

- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (file storage). See File uploads above.
- `GOOGLE_GENERATIVE_AI_API_KEY` — Gemini 2.5 Flash for PDF extraction (`src/lib/parse-pdf.ts`). Without it, `/api/process/parse-pdf` falls back to manual entry.
- `AI_PROVIDER`, `AI_MODEL`, `AI_ZERO_DATA_RETENTION`, `AI_GATEWAY_API_KEY` — which backend reads PDFs (#333). **Unset means Google directly** (self-hoster default, no extra account). `gateway` routes through Vercel AI Gateway with `zeroDataRetention: true` on every request (fails closed; needs Vercel Pro). **The hosted deployment sets `AI_PROVIDER=gateway`**, and the landing page states zero data retention because of it. See AI provider (#333).
- `GOOGLE_MAPS_API_KEY` — Geocoding + Distance Matrix (`src/lib/geocode.ts`, `distance.ts`, behind `/api/process/{geocode,distance}`), and Places API (New) for address suggestions (`src/lib/places.ts`, #480; falls back to Geocoding until enabled). See `docs/google-apis.md` for which APIs to enable. No Google API renders a map; the apartment page links to `/map` (#384).
- `OPENROUTESERVICE_API_KEY` — bike-distance fallback when Maps is unset (transit not supported).
- `PROCESS_RATE_LIMIT_PER_HOUR` — per-household hourly ceiling on each `/api/process/*` endpoint. **Unset means unlimited** (self-hoster default); the hosted deployment sets a value. Not a positive integer = boot-time-style failure at first use.
- `MAX_MEMBERS`, `MAX_APARTMENTS` — per-household entitlement caps. **Unset means unlimited** (self-hoster default). No tier dimension; see Entitlements (E5). **The hosted deployment sets 10 and 40**, which is what the landing page sells for CHF 5 — keep the three in sync.
- `PARSE_PDF_MAX_BYTES` — upload ceiling for `/api/process/parse-pdf` (`parsePdfMaxBytes` in `src/lib/process-schemas.ts`, read per call so tests can stub it). Defaults to 20 MB, Gemini's inline-file limit. Unlike the limits above, a non-numeric value falls back to the default rather than throwing.
- `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN` — **the email switch** and the verified sending domain, both set by the Resend Marketplace integration. Unset means no email is sent and inviting works as before. See Email (#300).
- `EMAIL_FROM`, `EMAIL_REPLY_TO` — optional. The From header (default `Flatpare <hello@<RESEND_EMAIL_DOMAIN>>`) and where replies go.
- `FEEDBACK_EMAIL` — where feedback from the app goes (#476). Unset means no Send feedback; needs email on. See Email.
- `FLATPARE_OPERATOR_NAME`, `FLATPARE_OPERATOR_CITY`, `FLATPARE_CONTACT_EMAIL` — who runs the deployment, named on `/terms` (#474). All three, or no terms page and no link. See Terms page.
- `BETA_REQUEST_NOTIFY_EMAIL` — optional. Where the owner is told about each new beta-invite request from the landing page (#301). Unset means no notification; requests are stored regardless and listed by `scripts/beta-pass.mjs requests`.
- `NEXT_PUBLIC_SITE_URL` — canonical origin for metadata only (`SITE_URL` in `src/lib/site.ts`); falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then `http://localhost:3002`. Nothing routes off it. See Landing page (E7).
- `FLATPARE_PUBLIC_ACCESS` — `closed` refuses sign-ins that would create a new account unless they carry a beta pass or a pending invitation; existing accounts are unaffected. **Unset means open** (self-hoster default). See Public access gate.
- `STRIPE_SECRET_KEY` — **the billing switch**. Unset means no checkout, and (unless `FLATPARE_CREDITS=on`) no quota enforcement and `apartments_ever_added` never incremented. See Apartment credits (E6).
- `FLATPARE_CREDITS` — `on` counts credits without Stripe (#492): processing spends them, running out offers a credit code instead of a checkout. **Unset, empty or `off` leaves counting to Stripe** (self-hoster default); anything else throws. The hosted deployment sets `on` during the beta. See Apartment credits (E6).
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — client key for embedded Checkout. Injected by the Vercel Stripe integration alongside the secret key.
- `STRIPE_WEBHOOK_SECRET` — signing secret for `POST /api/billing/webhook`, and the webhook's only authentication. **Not** injected by the integration — create the endpoint in the Stripe dashboard and copy it. Since the webhook is the only thing that grants credits, a deployment missing this takes money and grants nothing.
