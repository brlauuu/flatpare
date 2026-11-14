---
paths:
  - "src/app/page.tsx"
  - "src/app/_components/**"
  - "messages/*/landing.json"
  - "public/hero/**"
  - "scripts/capture-hero.mjs"
---

# Landing page (E7)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/landing-page.md](../../docs/agents/landing-page.md); read it before a non-trivial change here.

- `/` (`src/app/page.tsx` + `src/app/_components/landing.tsx`); words in `messages/<locale>/landing.json`. **Copy rules are enforced by `landing.test.tsx` and `landing-locales.test.tsx`**: `PRIVACY_CLAIM` verbatim, every `DISCLOSURES` entry rendered, one price, no unqualified zero-knowledge, no open source. Read the detail file before editing.
- The privacy section (`#privacy`) names every third party that sees plaintext. It does not name Vercel AI Gateway, but its zero-retention claim depends on `AI_PROVIDER=gateway`.
- **One plan: CHF 5 once, 10 people, 40 apartments processed (a lifetime quota)**; the hosted deployment must set `MAX_MEMBERS=10` and `MAX_APARTMENTS=40`, or the page becomes false. Change the numbers, the tests and the env together.
- Re-run `npm run build && npm run capture:hero` whenever the comparison grid's look changes. No prices in the hero sketches. `SITE_URL` makes the domain configuration.
