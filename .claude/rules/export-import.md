---
paths:
  - "src/lib/household-data/export-format.ts"
  - "src/components/household-data/export-import.ts"
  - "src/components/data-transfer-settings.tsx"
---

# Export and import (#191)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/export-import.md](../../docs/agents/export-import.md); read it before a non-trivial change here.

- All in the browser (`export-format.ts` pure, `export-import.ts` ZIP and posts). The format is versioned (`EXPORT_VERSION`); changing the shape of a JSON file means a new version and a reader for the old one. Import only into an empty household, makes no outside call, spends no credit, counts against `MAX_APARTMENTS`.
