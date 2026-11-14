---
paths:
  - "src/lib/display-name.ts"
  - "src/app/api/account/name/**"
  - "src/components/account-name-settings.tsx"
  - "src/app/api/household/members/**"
---

# Display names (#327)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/display-names.md](../../docs/agents/display-names.md); read it before a non-trivial change here.

- `displayName(name, email)` is the one fallback rule. **The name shown is read from the database, never the session** (the JWT is up to 24h stale). `parseDisplayName` caps at 60 and refuses control characters.
