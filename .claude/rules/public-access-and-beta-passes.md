---
paths:
  - "src/lib/{sign-up-gate,public-access,beta-pass,beta-requests}.ts"
  - "src/app/beta/**"
  - "src/app/api/beta-requests/**"
  - "scripts/beta-pass.mjs"
  - "src/app/_components/beta-request-form.tsx"
  - "src/auth.ts"
---

# Public access gate and beta passes (#239, #240)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/public-access-and-beta-passes.md](../../docs/agents/public-access-and-beta-passes.md); read it before a non-trivial change here.

- `FLATPARE_PUBLIC_ACCESS=closed` closes **sign-ups, not sign-ins**. Enforced in Auth.js's `signIn` callback (`decideSignUp`, `src/lib/sign-up-gate.ts`), not the proxy. Admitted while closed: existing accounts, a usable beta pass cookie, a pending invitation.
- Beta passes are the one door and the one free-credit mechanism. A use is consumed when a pass admits a new account (open or closed), by a guarded update. Revocation stops the link, never the people; nothing granted is clawed back. Credits land on the tester's first own household (stamp, then grant).
- Mint with `node scripts/beta-pass.mjs` — it reads `.env.local`, so it touches the remote DB unless the URL is cleared. No admin UI.
