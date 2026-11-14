---
paths:
  - "src/app/api/process/**"
  - "src/app/api/apartments/*/reprocess/**"
  - "src/app/api/billing/recompute/**"
  - "src/components/household-data/enrichment.ts"
  - "src/components/usage-notice.tsx"
  - "src/app/*/apartments/*/_components/processing-notice.tsx"
  - "scripts/usage-report*.mjs"
  - "src/lib/billing.ts"
  - ".github/workflows/**"
---

# Processing and credits (#413)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/processing-and-credits.md](../../docs/agents/processing-and-credits.md); read it before a non-trivial change here.

- **Creating an apartment is free; its first processing (PDF read or geocode) spends the credit**, keyed by the `apartmentId` the request names (`chargeFirstProcessing`: claim, then guarded spend). Reprocess and Recompute all cost one credit each; distances never charge.
- **The client names the apartment only on its first processing**, so the app never spends on its own. **A changed address is not geocoded again** (that would be a free reprocess, decided against); a PDF never overwrites what a member entered (`fillFromExtraction`).
- Out of credit (402) is not an error: the apartment stays unprocessed and `ProcessingNotice` says so. Buttons say what they cost only when billing is on.
- Usage counts (`process_usage`, `credit_spends`) are per household, never per member; `scripts/usage-report.mjs` reports them. **People are told in four places, plus the terms page** — change all of them with a new count. The scheduled report workflow runs on a public repo: it prints no counts, ids or errors and uploads no artifact.
