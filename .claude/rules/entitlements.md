---
paths:
  - "src/lib/{limits,invitations,env-int}.ts"
  - "src/app/api/invitations/**"
  - "src/app/api/apartments/route.ts"
---

# Entitlements (E5)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/entitlements.md](../../docs/agents/entitlements.md); read it before a non-trivial change here.

- `MAX_MEMBERS`, `MAX_APARTMENTS` via `readLimits()`. **No tier dimension**: `households.tier` is read by nothing; adding a `householdId` argument to `readLimits()` would reverse that decision.
- Enforced server-side in `createApartmentRow` (atomic conditional insert), `createInvitation` (members **plus pending invitations**, a courtesy check) and **`acceptInvitation`, the real enforcement point**.
- UI counters render only when a limit is configured, with tests for their absence.
