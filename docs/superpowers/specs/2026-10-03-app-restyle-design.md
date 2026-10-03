# App-wide restyle (#324) — design

**Status:** approved in conversation 2026-10-03; this document awaits the owner's review.
**Visual reference:** the design canvas "Flatpare app restyle" (https://claude.ai/artifact/1oFWfXpd5WuczNZh1eNXFy) — foundations sheet plus Apartments, Compare, Apartment detail (light and dark), Household, Unlock and the phone list. Where this document and the canvas differ, this document wins (one deliberate difference: the dark thin line, below).
**Timing:** before 1.0.0 (decided on #324).

## Goal

The signed-in app, `/billing`, `/invitations` and the encryption screens take on the landing page's look (#301: neo-brutalism — blue & white in light, black & yellow in dark), so the product looks like the page that sells it.

## Decisions taken

1. **Derived from the landing page, not designed separately.** The landing tokens become the app's theme; no Claude Design round for the app.
2. **Full strength on the frame, quieter inside dense content.**
   - *Frame* (3px border + hard offset shadow): the nav bar's bottom edge, cards, dialogs, dropdown and select menus, primary/secondary/destructive buttons, badges (2px, no shadow), and single-purpose inputs (search, sort, passphrase, recovery code).
   - *Dense* (1px `--border` line, no shadow): table cells, rows in lists, fields inside multi-field forms (apartment edit form, invite, rating comment), separators.
3. **One token source.** The palette lives once, as the app's shadcn tokens in `src/app/globals.css`. The landing page's `--lp-*` tokens become aliases of them wherever the value is the same; only landing-only values (video panel, hero sketch, map doodle, code block, grid) keep their own.
4. **Fonts** move to the root layout: Archivo (`--font-sans`) and IBM Plex Mono (`--font-mono`) replace Geist. Caveat stays landing-only.

## Tokens

All values are the landing page's own, except where noted.

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--background` | `#ffffff` | `#0d0d0d` | |
| `--foreground` | `#000000` | `#ffffff` | |
| `--card`, `--popover` | `#ffffff` | `#161616` | |
| `--card-foreground`, `--popover-foreground` | `#000000` | `#ffffff` | |
| `--primary` | `#2346ff` | `#ffe500` | |
| `--primary-foreground` | `#ffffff` | `#000000` | |
| `--secondary`, `--muted`, `--accent` | `#e6ecff` | `#1f1c00` | the landing "soft" |
| `--secondary-foreground`, `--accent-foreground` | `#000000` | `#ffffff` | |
| `--muted-foreground` | `#3d3d3d` | `#bdbdbd` | |
| `--destructive` | `#c8102e` | `#ff5c6c` | new values |
| `--border` | `#1a1a1a` | `#6b6b6b` | the **dense** line. Every plain `border` utility in the app uses this token, so the quiet weight is the default and frame elements opt in with `border-frame`. **Dark differs from the canvas** (`#5c5c5c` measured 2.9:1 on `#0d0d0d`, under WCAG 1.4.11's 3:1 for a field boundary) |
| `--input` | `#1a1a1a` | `#6b6b6b` | same as `--border` |
| `--ring` | `#2346ff` | `#ffe500` | |
| `--radius` | `0` | `0` | every `rounded-sm…4xl` derives from it, so this squares the app; `rounded-full` (circles) is left alone |
| new `--frame` | `#000000` | `#ffffff` | card/button/dialog border |
| new `--warning` | `#b45309` | `#ffa94d` | low-credit balance (#305) |
| new `--success` | `#0a7a3d` | `#4ade80` | replaces the hard-coded greens |
| new `--shadow-frame` | `6px 6px 0 #000` | `6px 6px 0 #ffe500` | cards, dialogs, menus |
| new `--shadow-button` | `4px 4px 0 #000` | `4px 4px 0 #fff` | |
| new `--shadow-pressed` | `1px 1px 0 #000` | `1px 1px 0 #fff` | `:active`, with `translate(3px,3px)` |
| new `--shadow-hero` | `10px 10px 0 #2346ff` | `10px 10px 0 #ffe500` | full-screen gates (encryption screens) |

`--chart-*` and `--sidebar-*` are mapped onto the same family (primary / soft / foreground); nothing visible depends on them today.

New tokens are registered in `@theme inline` (`--color-frame`, `--color-warning`, `--color-success`, `--shadow-frame`, …) so they are usable as Tailwind utilities (`border-frame`, `text-warning`, `shadow-frame`).

### Contrast, enforced by a test

A new `src/app/__tests__/theme-contrast.test.ts` reads the `:root` and `.dark` blocks of `globals.css` and asserts, in both themes: every text/background pair the app uses (`foreground`/`background`, `card-foreground`/`card`, `muted-foreground`/`background`, `muted-foreground`/`muted`, `primary-foreground`/`primary`, `destructive`/`background`, `warning`/`background`, `success`/`background`) is at least 4.5:1, and `input`/`background`, `input`/`card` are at least 3:1. A future palette tweak that breaks legibility fails CI instead of shipping.

## Typography

- `--font-sans` = Archivo, `--font-mono` = IBM Plex Mono, loaded in the root layout via a new leaf module `src/app/fonts.ts` (tests stub it, as they stub `landing-fonts.ts`, because `next/font` only runs under the Next compiler).
- `landing-fonts.ts` keeps only Caveat; the landing CSS's `--font-archivo` / `--font-plex-mono` references are repointed at `--font-sans` / `--font-mono`.
- Base layer: `h1`, `h2` weight 900, `letter-spacing: -0.03em`; `h3` weight 700–800.
- Numbers that are compared — rent, size, rooms, commute minutes, scores, short codes, credit counts — are set in `font-mono` so columns line up.

## Base components (`src/components/ui/`)

These are shadcn files, edited in place (normal shadcn practice). Re-running `npx shadcn add <component>` would overwrite them; AGENTS.md gets a line saying so.

- **button** — `default`: primary fill, 3px `border-frame`*, `shadow-button`, `:active` moves into its shadow. `outline` / `secondary`: card fill, 3px frame, `shadow-button`. `destructive`: card fill, red text and red 3px border (outlined, as on the canvas). `ghost` / `link`: no border, no shadow. Sizes keep the ≥44px touch target.
  *In dark mode the primary button's border is black, as on the landing page (`--lp-btn-line`).
- **card** — 3px `border-frame`, `shadow-frame`, square.
- **input / textarea / select trigger** — a `weight` prop: `"dense"` (default; 1px `border-input`) or `"frame"` (3px `border-frame`). `frame` is used for search, sort, passphrase and recovery-code fields.
- **badge** — `font-mono`, `tracking-wide`, 2px border, square; variants map to primary fill / outline. *Amended during implementation:* not uppercase — badges also show values, and uppercase turns `m²` into `M²`.
- **dropdown-menu, select content** — 3px frame + `shadow-frame`.
- **separator** — 1px `border` (the dense line).

## Screens and components hand-tuned

Off-theme styling was measured on 2026-10-03: hard-coded palette colours in 6 files, hex colours in the two Leaflet components and the root layout's viewport, ~42 `rounded-*` uses (all but `rounded-full` follow `--radius`), 7 ad-hoc `shadow*` uses.

- **Nav bar** (`nav-bar.tsx`) — 3px bottom frame line; the current section is a filled block (primary fill, frame border); the real `flatpare_logo` SVG stays (the canvas's square mark was a stand-in).
- **Apartments list** — cards per the canvas: short-code badge, average-rating badge on the soft fill, mono facts row under a thin line. `apartment-badges.tsx` greens/reds → `success` / `destructive`.
- **Compare table** (`compare-table.tsx`) — 3px outer frame, no shadow; 1px thin lines inside; header row underlined with a 3px frame line; numbers in mono; the best value per row gets the `secondary` fill in light and the `primary` (yellow) fill with black text in dark, both bold. The hard-coded `text-green-600` goes; the cell carries `data-best="true"` and **`compare-table.test.tsx` asserts that attribute instead of a colour class**.
- **Apartment detail** — facts and commutes as dense rows inside frame cards; map in a frame card; rating panel score buttons square 48px, selected = primary fill + button shadow. `star-rating.tsx` yellows → `primary`.
- **Upload flow** (`status-badge.tsx`, `review-step.tsx`) — greens/reds → `success` / `destructive`.
- **Credit balance** (`credit-balance.tsx`) — orange → `warning`, red → `destructive`; the screen-reader text stays.
- **Household / Settings** — members, invitations and locations as dense rows inside frame cards; credit pool card on the soft fill.
- **Encryption screens** (unlock, setup, pending, household-key, forgot-passphrase, recovery kit) — the full-screen gate treatment: background grid as on the landing hero, the form in a frame card with `shadow-hero`. **The recovery kit prints black on white with no shadows or grid** (`print:` utilities), as it does today.
- **Maps** (`*-map-inner.tsx`) — map tiles do not follow the theme, so marker colours are constant: apartment = brand blue `#2346ff`, place of interest = orange `#d9480f`, both with a 2px black outline. Today both use the same pin shape (`makeIcon`), so the two colours also differ in lightness (`#2346ff` is the darker) to stay distinguishable without relying on hue alone.
- **`/billing`, `/invitations`, `error.tsx`, `loading.tsx`, the sign-in card on the landing page** — inherit the tokens and components; checked by screenshot, adjusted only where they break.
- **Guide page** — headings follow the base styles; prose spacing checked by screenshot.

## PWA and browser chrome

- `src/app/manifest.ts`: `theme_color` = `#2346ff` (primary), `background_color` = `#ffffff` (background), keeping AGENTS.md's rule that they mirror `--primary` / `--background`.
- `src/app/layout.tsx` viewport `themeColor`: light `#ffffff`, dark `#0d0d0d`.

## Landing page

Its look must not change. `--lp-*` values that equal an app token become `var(--…)` aliases; `.dark .landing` keeps only the overrides that differ from the app's dark tokens. Verified by before/after screenshots of `/` in both themes. After the restyle, re-run `npm run build && npm run capture:hero`, since the hero image is a screenshot of the compare grid and must show the new look.

## Testing

- `theme-contrast.test.ts` (above).
- `compare-table.test.tsx` moves from asserting `text-green-600` to `data-best`.
- Every existing suite stays green; `landing.test.tsx` unchanged.
- **Screenshots, light and dark, of every screen** listed above, before and after, attached to the PR — taken with the `capture:hero` approach (production build, throwaway local database, invented data served by Playwright), so nothing touches a real database.
- `npm run lint`, `npm run typecheck`, `npm run test:coverage` (thresholds unchanged).

## Delivery

One PR. Merges do not deploy, but every merged PR is released and every release deploys (#321), so splitting this across PRs would put a half-restyled app in front of beta testers. The PR is organised as reviewable commits: tokens + fonts + landing aliases → base components → screens → maps, PWA, hero recapture → docs.

## Out of scope

Copy changes, layout restructuring beyond styling, i18n (#288), new features. The hand-drawn hero sketch (Caveat) stays on the landing page.

## Documentation

AGENTS.md: the Landing page section stops saying the look is scoped to `.landing` and points at the shared tokens; a short Theme section records the token table's intent, the frame/dense rule, the `weight` prop, the contrast test, and the shadcn-overwrite caveat; the PWA section's colour note is updated.

## Architecture

No new module boundaries beyond `src/app/fonts.ts`, a leaf (imports only `next/font/google`). No route, data or crypto code changes. enola should report no new cycle; checked after implementation.
