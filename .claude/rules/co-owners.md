---
paths:
  - "src/lib/{household,household-email,invitations}.ts"
  - "src/app/api/household/**"
  - "src/app/api/crypto/{recovery,recover,wraps,pending-wraps}/**"
  - "src/components/household-settings.tsx"
---

# Co-owners (#192)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/co-owners.md](../../docs/agents/co-owners.md); read it before a non-trivial change here.

- Any number of equal owners. **"At least one owner" is a condition inside the statement** that demotes/removes/leaves, never a count read first. `setMemberRole` runs in `db.transaction` on purpose (busy retry). `households.owner_id` is the creator and is read by nothing.
- One recovery kit per household; making a new one notifies the other owners. Any member holding the data key can wrap it for a pending member.
