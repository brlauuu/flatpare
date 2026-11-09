# Dependency maintenance

Full reference, moved verbatim from AGENTS.md. The always-on rules for this area are summarised in AGENTS.md; this file holds the detail, the measurements and the history behind them.

- **`npm outdated` lies about two of these; do not "fix" them** (#264):
  - **`next-auth` shows `latest: 4.24.15`** while we run `5.0.0-beta.32`. v5 is published under the `beta` dist-tag, so npm's `latest` points at the old v4 line. Current == wanted; there is nothing to bump. Downgrading to the "latest" would remove the entire auth model.
  - **`typescript` shows `latest: 7.0.2`** and stays on 6 deliberately — `typescript-eslint` does not support TS 7, so `npm run lint` dies at require time. Reasoning and the re-check trigger are in `docs/security-notes.md`.
- **`@types/node` tracks the Node RUNTIME, not npm's latest.** CI (`.github/workflows/test.yml`) and the `Dockerfile` both run **Node 24**, so the types are pinned to `^24`. They had drifted to 25.x — typing against APIs a major ahead of anything that actually runs this code, which is how you typecheck green against a function that does not exist in production. If the runtime moves, move these together; do not accept an `npm outdated` suggestion here on its own.
- `npm audit` acceptances and pins live in `docs/security-notes.md`, not here.
- **`npm audit fix` cannot run in this repo on npm 10** — it dies with `Cannot read properties of null (reading 'edgesOut')`, bisected to the `vite` node (#247). npm 11, which Node 24 ships, handles it; `npx npm@11 <cmd>` is the workaround on an older local npm.
