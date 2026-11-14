---
paths:
  - "src/lib/{drafts,draft-limit}.ts"
  - "src/app/api/drafts/**"
  - "src/components/household-data/**"
---

# Drafts, retired

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/drafts.md](../../docs/agents/drafts.md); read it before a non-trivial change here.

- Nothing creates drafts any more (#413): links become unprocessed apartments. `adoptDrafts` converts leftovers after each load; rotation still re-seals them. A shared link wins over a PDF's link.
