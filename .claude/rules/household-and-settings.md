---
paths:
  - "src/app/*/household/**"
  - "src/app/*/settings/**"
  - "src/components/{household-settings,locations-settings,account-name-settings,data-transfer-settings}.tsx"
  - "src/app/api/household/**"
  - "src/app/api/locations/**"
  - "src/components/household-credits.tsx"
---

# Household page and Settings (#298)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/household-and-settings.md](../../docs/agents/household-and-settings.md); read it before a non-trivial change here.

- `/household` is the group (members, invitations, credits, rotation, locations); `/settings` is the person. Every member may edit locations; only owners see Recompute (UI only — the distance route must stay open to every member). Role is read from `household_members`, not the token.
