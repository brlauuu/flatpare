# Display names (#327)

Full reference. The rules for this area are in `.claude/rules/display-names.md` (loaded when working on its files), with anything cross-cutting in AGENTS.md; this file holds the detail, the measurements and the history behind them.

- **A person sets their own name on Settings** (`AccountNameSettings`, `src/components/account-name-settings.tsx` → `GET`/`PUT /api/account/name`). Empty clears it. `parseDisplayName` (`src/lib/display-name.ts`, a leaf) refuses control and Unicode format characters and caps it at 60 — the same cap as `safeName` in the email templates.
- **`displayName(name, email)` is the one fallback rule: the email until a name is set.** Ratings (`ratingRow`), the signed-in identity (`resolveHouseholdIdentity` → nav menu, your own rating card) and the Household member list all use it. The emails and `/invitations` keep their own fallbacks, because they reach people outside the household. Privacy reasoning in `docs/security-notes.md`.
- **The name shown is read from the database, never the session**: the JWT's `name` is up to 24h stale. `resolveHouseholdIdentity` reads `users.name` (`currentDisplayName` in `src/lib/session.ts`); the session's name is only a fallback when the row cannot be read. After a save the card calls `router.refresh()` (the shared layout re-reads the identity) and the store's `reload()` (ratings carry the rater's name).
- Plaintext account data in the Auth.js `users` table, not an envelope — by decision on the issue.
