---
paths:
  - "src/app/map-data/**"
  - "src/lib/map/**"
  - "scripts/build-map.sh"
  - "docker-entrypoint.sh"
  - "Dockerfile"
  - "docker-compose.yml"
---

# Self-hosted map data (#339)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/self-hosted-maps.md](../../docs/agents/self-hosted-maps.md); read it before a non-trivial change here.

- `FLATPARE_MAPS=openfreemap|local`; unset in the app = OpenFreeMap, but the Docker entrypoint refuses to start until it is set. **`local` never contacts an outside service** and never falls back to OpenFreeMap. flatpare.com serves no map data. Keep Planetiler's pinned digest and layers in sync with `style.ts`.
