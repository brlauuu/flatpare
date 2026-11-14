---
paths:
  - "package.json"
  - "package-lock.json"
  - "docs/security-notes.md"
---

# Dependency maintenance

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/dependencies.md](../../docs/agents/dependencies.md); read it before a non-trivial change here.

- **Do not "fix" `npm outdated`** for `next-auth` (v5 is on the `beta` tag) or `typescript` (stays on 6 for `typescript-eslint`).
- `@types/node` tracks the Node runtime (24), not npm's latest. `npm audit fix` needs npm 11 (`npx npm@11`). Audit acceptances live in `docs/security-notes.md`.
