---
paths:
  - "src/components/map/**"
  - "src/lib/map/**"
  - "src/app/*/map/**"
---

# Map page (#330)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/map-page.md](../../docs/agents/map-page.md); read it before a non-trivial change here.

- MapLibre on `/map`; **only `household-map-inner.tsx` and `map-protocols.ts` import `maplibre-gl`**, loaded with `next/dynamic` (`ssr: false`). The inner stays counted at 0% coverage; logic belongs in tested `src/lib/map/` modules. No buildings, house numbers or POIs in the style. Guide sits in the user menu because the phone nav bar is full.
