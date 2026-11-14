---
paths:
  - "src/app/api/process/**"
  - "src/lib/{safe-url,geocode,distance,places,find-listing,parse-pdf,parse-pdf-error,rate-limit,process-schemas,address-bias,log-scrub}.ts"
---

# Blind proxies (E4)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/blind-proxies.md](../../docs/agents/blind-proxies.md); read it before a non-trivial change here.

- **`/api/process/*` routes are blind proxies**: plaintext in, third-party result out, nothing stored except the usage counter (and the credit tables when billing is on). This is the documented privacy exception; each route says so in its header comment.
- `consumeRateLimit` runs right after `requireMember()`, **before** the outbound call, and counts every call even with no limit set.
- **Never log an error's message, stack or cause from a process route** (outbound URLs carry addresses and API keys).
- **Every outbound request on a user's behalf goes through `assertPublicHttpUrl`** (`src/lib/safe-url.ts`), which re-validates every redirect hop.
- `no-leak.test.ts` covers all routes; its serializer expands Errors on purpose — keep it.
- Listing search uses Google's grounding only; do not swap in Perplexity, Exa or Parallel on the hosted deployment (no zero-retention terms).
