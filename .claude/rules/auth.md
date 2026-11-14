---
paths:
  - "src/auth.ts"
  - "src/proxy.ts"
  - "src/lib/{auth,session,api-route}.ts"
  - "src/app/api/**"
  - "src/app/login-form.tsx"
  - "src/app/_components/sign-in-dialog.tsx"
  - "src/app/invitations/**"
---

# Auth

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/auth.md](../../docs/agents/auth.md); read it before a non-trivial change here.

- **Auth.js v5** (`next-auth@5.0.0-beta`) in `src/auth.ts`, real accounts in `users`/`accounts`/`sessions` via the Drizzle adapter. Providers are chosen from env at boot: OAuth (Google/GitHub), magic link (`resend`, whenever email is on; links expire in 15 minutes), and the shared-password credentials provider **only when no OAuth client ID is set and email is off**. `enabledProviderIds` tells `src/app/page.tsx` which buttons to render.
- **JWT sessions capped at 24h**, deliberately: `householdId`/`role` are stamped at sign-in and not re-resolved per request. Destructive and create handlers re-check membership in the database.
- **`src/proxy.ts` is the primary gate**; `/api/auth/*` is allow-listed wholesale (gating part of it breaks sign-in). Every new public asset or unauthenticated route must be added to the matcher or allow-list deliberately — the detail file lists them and why.
- **Route handlers check again**: data routes use `requireMember()` (`src/lib/api-route.ts`), which re-reads membership and answers **404, never 403**, for foreign rows. Crypto, invitation and household routes use `requireHousehold()` (`src/lib/session.ts`). Only the three no-household invitation routes read `auth()` directly.
- `session.householdId` and `role` are nullable (pending invitation). `unstable_update({})` re-resolves them; the client then does a full navigation.
- **Footguns**: setting an OAuth `CLIENT_ID` without its `SECRET` breaks all sign-in; callback URLs must be registered with the provider before deploying. Security limits and accepted advisories live in `docs/security-notes.md`.
