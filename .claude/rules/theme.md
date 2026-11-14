---
paths:
  - "src/app/globals.css"
  - "src/lib/utils.ts"
  - "src/components/{theme-provider,theme-toggle,themed-logo}.tsx"
  - "src/components/ui/**"
---

# Theme (#324)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/theme.md](../../docs/agents/theme.md); read it before a non-trivial change here.

- One palette in `src/app/globals.css`; **colours come from tokens, never Tailwind's palette** (map style excepted). `theme-contrast.test.ts` enforces contrast in both themes and print.
- Frame (3px border + hard shadow) vs dense (1px, no shadow); fields take `weight`.
- **Never combine `title-*` with `text-*`, `font-*`, `tracking-*` or `leading-*`**. New theme utilities that overlap a Tailwind group go in `extendTailwindMerge` in `src/lib/utils.ts`. Focus rings at full strength.
