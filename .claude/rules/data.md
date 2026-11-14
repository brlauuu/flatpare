---
paths:
  - "src/lib/household-data/**"
  - "src/components/household-data/**"
  - "src/app/api/{apartments,ratings,locations}/**"
  - "src/lib/{data-rows,apartments-store,locations,apartment-sort,edited-fields}.ts"
  - "src/components/{use-format-rent,use-added-by}.ts"
  - "src/components/{short-code,added-by-line,apartment-edit-form,apartment-form-fields}.tsx"
  - "src/app/*/apartments/**"
  - "src/app/*/compare/**"
---

# Data (E3)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/data.md](../../docs/agents/data.md); read it before a non-trivial change here.

- Tables `apartments`, `ratings`, `locations` hold an opaque `envelope` (`{v:1,iv,ct}` or `{v:0,data}`); **the server never parses it**, only checks its version matches the mode. Everything user-supplied is inside it; only ids, `household_id`, timestamps, `version`, `sort_order` and rating keys are plaintext.
- **Adding a field** = type + zod schema with a default + `emptyApartment()` in `src/lib/household-data/`; no migration.
- AAD is `"<householdId>:<table>:<rowId>"`. A row that fails to open decodes to `null` and renders as **corrupt**, never a crash. Ids are client-minted UUIDs.
- **Layering**: `src/lib/household-data` imports only `@/lib/crypto`; `src/components/household-data` is the only place combining codec and `fetch`; pages use `useHouseholdData()` and never fetch household data or import the codec; routes get wire types through `src/lib/data-rows.ts`. Nothing under `src/lib/` imports `@/components`.
- Apartments carry `version` (409 `Stale version`, the store retries once); ratings and locations are last-write-wins. Sorting, search, averages are derived in the browser.
- **Rents are never converted between currencies**, and every rent on screen goes through `useFormatRent`. The short code is rebuilt inside the write (`syncShortCode`); letter uniqueness is checked in the browser. `addedBy` lives in the envelope, never a column.
- Page tests use `renderWithHouseholdData` from `fake-household-data.tsx` and assert on its `vi.fn()` write methods, never on `fetch`.
