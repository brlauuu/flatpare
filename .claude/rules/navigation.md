---
paths:
  - "src/app/**/layout.tsx"
  - "src/app/**/loading.tsx"
  - "src/components/nav-bar.tsx"
  - "src/app/billing/**"
---

# Navigation and the signed-in shell (#302)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/navigation.md](../../docs/agents/navigation.md); read it before a non-trivial change here.

- Every signed-in section lives in `src/app/(app)/` under **one** layout, the only one that awaits `auth()` and mounts `NavBar`, `CryptoGate` and `HouseholdDataProvider`.
- **Do not add an `async` layout or a provider to a section** (`signed-in-layouts.test.tsx` fails on it). A page that must not require an unlocked key (like `/billing`) goes outside `(app)`.
- `src/app/(app)/loading.tsx` is what makes navigation feel instant. The store refreshes in the background on a section switch and drops the refresh if a write committed meanwhile.
