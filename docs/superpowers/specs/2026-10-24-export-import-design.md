# Export and import (#191)

## Why

Under end-to-end encryption the host cannot restore anyone's data. A household's own export is the only backup it can have, and beta testers are told their data is permanent. The export is what makes that true. It is also the way to move a household to a self-hosted instance, to switch a database's encryption mode (which otherwise needs a fresh database, see Database in `AGENTS.md`), or to open the data in a spreadsheet.

## Decided on the issue (2026-10-03)

- **Plaintext ZIP**: JSON for apartments, ratings and locations, plus the original decrypted PDFs. The export screen warns that anyone holding the file can read it. A password-sealed variant may come later.
- **Any member can export.** Every member can already decrypt everything.
- **Import into an empty household only**, re-encrypted through the normal create path.
- **Ratings are not dropped**: user ids do not survive a move, so other people's ratings are kept as text attached to the importer, labelled with the original rater's name.

## Calls made for this build (2026-10-24, the owner handed these over)

1. **Everything runs in the browser.** The export reads the decrypted store and downloads each PDF through `downloadPdf`; the import seals and posts through the existing routes. No new route, no migration. The server never sees the file.
2. **The import makes no outbound calls.** Coordinates, short codes and distances are carried over, so nothing is geocoded or measured again: no paid calls and no address sent to a third party. Distances are remapped to the new location ids. An apartment with an address but no coordinates stays that way; the map page's geocode pass and Recompute exist for that.
3. **New ids for every row.** Re-importing into the same instance, while the original household still exists, would otherwise collide (`409 Duplicate id`). The AAD includes the household id anyway, so every row and PDF is re-sealed.
4. **Imports spend credits and respect `MAX_APARTMENTS` like any add.** A server-side "import, don't charge" switch could not tell an import from an ordinary add, so it would be an unlimited free-add path. Billing is off for self-hosters, who are the main destination. The import screen says how many apartments it will add and refuses up front when the balance or the cap is short, instead of failing halfway.
5. **"Empty"** means no apartments and no locations. Ratings cannot exist without apartments. Checked in the browser against the loaded store; two members importing into the same empty household at the same moment is not guarded against.
6. **Ratings**: a rating whose user id is the importer's own (same instance) is restored as theirs. Every other rating becomes a line in the importer's rating comment on that apartment: `Rated by Lena: overall 4/5, kitchen 3/5, ... "comment"`. When the importer had not rated it, their rating is created with every score at 0 ("not rated", which never counts in an average) and only those lines as the comment.
7. **Format** `flatpare-export-<YYYY-MM-DD>.zip`:
   - `manifest.json`: `{ format: "flatpare-export", version: 1, exportedAt, appVersion, counts, skipped }`. `skipped` counts rows that could not be decrypted, which are left out.
   - `apartments.json`: `[{ id, createdAt, updatedAt, data }]`, where `data` is the `Apartment` with `pdf` replaced by `"pdfs/<id>.pdf"` or `null`.
   - `ratings.json`: `[{ apartmentId, userId, userName, updatedAt, data }]`.
   - `locations.json`: `[{ id, sortOrder, data }]`.
   - `apartments.csv`: one row per apartment with the main fields and average scores, for spreadsheets. The import ignores it.
   - `pdfs/<id>.pdf`: the decrypted originals.
   
   Import validates with the existing zod schemas (with the same defaults old envelopes get). A file that is not a Flatpare export, or has a newer `version`, is refused with a clear message.
8. **ZIP library**: `fflate` (small, no dependencies, works in the browser).
9. **UI**: a "Your data" section on the Household page, for every member: "Export" with the plaintext warning, and "Import" shown only while the household is empty. Import shows progress and ends with a report (apartments, PDFs, locations, ratings added; anything that failed). A failure part-way leaves what was already created. The household is then not empty, and the report says so.
10. **Encryption off** works the same way: `dataKey` is null and the codec stores plaintext envelopes.

## Non-goals

- A password-sealed export (later, optional).
- Merging into a household that already has data.
- A server-side or scheduled backup.

## Where things go

- `src/lib/household-data/export-format.ts`: pure. Builds the file list from decoded rows, parses and validates a ZIP's contents, plans an import (id maps, distance remap, rating text). Unit-tested without a browser.
- `src/components/household-data/export-import.ts`: sequences fetch, crypto and the ZIP (download PDFs, upload re-sealed PDFs), beside `rotation.ts`.
- The store gains `exportHousehold()` and `importHousehold(file, onProgress)`, which write without enrichment.
- `src/components/data-transfer-settings.tsx`: the Household page section. Copy in all five catalogues, and a guide section in all five guides.
