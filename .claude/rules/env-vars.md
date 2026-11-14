---
paths:
  - ".env.example"
  - "docker-compose.yml"
  - "src/lib/env-int.ts"
  - "docs/self-hosting*.md"
---

# Cloud-mode env vars

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/env-vars.md](../../docs/agents/env-vars.md); read it before a non-trivial change here.

- Every feature key degrades cleanly when unset. The full list, with defaults and what the hosted deployment sets, is in the detail file. **`STRIPE_WEBHOOK_SECRET` is not set by the integration**; without it the deployment takes money and grants nothing.
