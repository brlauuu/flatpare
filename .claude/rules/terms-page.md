---
paths:
  - "src/app/terms/**"
  - "src/content/terms.*.md"
  - "src/lib/operator.ts"
  - "src/app/_components/release-notice.tsx"
---

# Terms page (#474)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/terms-page.md](../../docs/agents/terms-page.md); read it before a non-trivial change here.

- `/terms` from `src/content/terms.<locale>.md`; English is binding. **No page and no link unless all three operator vars are set** (`readOperator`), so self-hosted copies never name the flatpare.com operator. Keep it true (see the recurring privacy rule); a change of substance needs a one-time notice in the signed-in layout first.
