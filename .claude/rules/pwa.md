---
paths:
  - "src/app/manifest.ts"
  - "public/sw.js"
  - "public/*.png"
  - "src/lib/{share-stash,install-state}.ts"
  - "src/app/share-target/**"
  - "src/components/install/**"
  - "src/components/{service-worker-registrar,pending-share-prompt}.tsx"
---

# PWA

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/pwa.md](../../docs/agents/pwa.md); read it before a non-trivial change here.

- The manifest is `src/app/manifest.ts`; its colours must match `globals.css` (`manifest.test.ts`). Browsers fetch the manifest and icons without credentials, so they stay outside the proxy.
- **`public/sw.js` only receives shares** (`POST /share-target`) and caches nothing. Its stash layout is duplicated in `src/lib/share-stash.ts`; the test fails if they drift.
- **Nothing in the share stash is acted on without the person's tap** (any site can forge a POST to `/share-target`). Intake waits for `status === "ready"`. Sign-out clears the stash. The no-worker route never reads the body.
- Android does not honour `file_handlers`; do not claim it does in the guide.
