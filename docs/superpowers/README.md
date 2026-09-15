# Planning documents — read this first

**Nothing in this directory is current documentation.** These are design specs and
implementation plans written *before* the work, kept as a record of intent. They are not
maintained afterwards, and several describe a product that no longer exists.

For what Flatpare actually does now:

| Question | Where the answer lives |
|---|---|
| How the code is organised, and which conventions are load-bearing | [`AGENTS.md`](../../AGENTS.md) |
| How to run, configure or deploy it | [`README.md`](../../README.md) |
| Threat model, accepted advisories, security decisions | [`docs/security-notes.md`](../security-notes.md) |
| What a user sees | [`src/content/guide.md`](../../src/content/guide.md) |

**Where a plan and `AGENTS.md` disagree, `AGENTS.md` is right.** Several decisions were
reversed during implementation — E5's tier dimension was designed and then not adopted,
E6's "40 apartments" changed meaning, and three Stripe defects (#238) were only found
against the live API, after the design was written.

## Unticked checkboxes do not mean unfinished work

Every plan uses `- [ ]` task syntax, and **none of them were ticked back after the work
shipped.** E1 through E6 are all in `main` with the boxes still empty.

Do not read completion state out of these files, and do not "resume" a plan because its
boxes are unchecked. Check `git log`, the code, or `AGENTS.md`.

## What shipped

| Epic | Subject | Status |
|---|---|---|
| E1 | Accounts, OAuth, multi-tenancy | shipped |
| E2 | Crypto core — member keys, passphrase, recovery kit | shipped |
| E3 | Encrypted data model — envelope rows, client store | shipped |
| E4 | Blind-proxy hardening — rate limits, log scrubbing, SSRF | shipped |
| E5 | Entitlement caps (`MAX_MEMBERS`, `MAX_APARTMENTS`) | shipped |
| E6 | Stripe one-time purchase and apartment credits | shipped |
| E7 | Landing page | shipped |

## The 2026-04 documents are superseded

Everything dated `2026-04-*` predates accounts and encryption. They describe a shared
password, a `flatpare-name` cookie, a name-picker for identity, plaintext database rows,
and a single hard-coded station instead of user-chosen locations of interest.

The ones that actively describe that model carry a superseded banner. **Do not implement
anything from them.** They are kept because the reasoning behind some still-current
behaviour lives there — the pager, sort and search designs, for instance, still describe
how those features work, even though the surrounding app changed underneath them.
