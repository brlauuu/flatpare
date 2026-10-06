# Map page (#330) — design

Status: approved in conversation 2026-10-06; look validated by a throwaway Basel preview the same day.

## Goal

A page of its own, `/map`, showing every apartment in the household and every location of interest on a map that looks like the rest of Flatpare: a printed street map on the landing page's grid, with the household's own marks drawn on it by hand. Hover shows the basics of an apartment; click opens it. It must work as well on a phone as on a desktop.

What the owner asked for, in their words: streets, rivers, lakes — no houses, buildings or that level of detail; keep street and neighbourhood names; the user's locations look hand-drawn, "like I did it on a map that I bought that has printed street and neighbourhood names."

## Non-goals

- Self-hosting the map data. Tracked as #339; this design keeps it a one-line change (the style's `sources` entry).
- A handwritten font for the printed layer. Street and neighbourhood names use a clean font; only the household's marks are hand-drawn.
- Replacing the small map on the apartment detail page. It stays on Leaflet for now; moving it to this style is a later, separate change.
- Filters, distance lines, drawing tools. Not asked for.

## Rendering: MapLibre GL + OpenFreeMap vector tiles

The current maps are Leaflet over `tile.openstreetmap.org` raster tiles. Raster tiles arrive with every building, shop icon and colour already painted, so nothing can be removed and the look cannot be ours. Vector tiles carry the data, and a style we write decides what is drawn and how.

- **Library:** `maplibre-gl` (v5), a new runtime dependency. Loaded only by `/map`, through `next/dynamic` with `ssr: false`, so no other page's bundle grows (~800 KB minified).
- **Data:** OpenFreeMap (`https://tiles.openfreemap.org/planet`, OpenMapTiles schema). Free, no key, no account. Glyphs from `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` (Noto Sans Regular / Bold / Italic).
- **No API key and no env var.** A self-hoster gets the map with zero setup, as today.

### The style

A pure function `mapStyle(theme: "light" | "dark")` returning a MapLibre style object. Layers, bottom to top:

| Layer | Source layer | Drawn as |
|---|---|---|
| parks, grass, wood | `park`, `landcover` | faint green fill |
| water | `water` | soft blue fill |
| streams, canals | `waterway`, **excluding `class = river`** | thin blue line (rivers are already the water fill; the preview showed a line down the middle of the Rhine) |
| rail | `transportation` `class = rail` | thin dashed grey |
| minor / service streets | `transportation`, minzoom 13 | thin grey line |
| tertiary / secondary | `transportation` | ink line, ~55% opacity |
| primary / trunk / motorway | `transportation` | ink line, ~70% opacity |
| water names | `water_name`, `waterway` | italic, blue |
| street names | `transportation_name`, minzoom 14 | small, dark grey, halo |
| neighbourhood names | `place` `suburb/quarter/neighbourhood` | bold, upper-case, letter-spaced, ~45% ink |
| city / town | `place`, maxzoom 13 | bold |

**Deliberately absent:** `building`, `housenumber`, `poi`, `aerodrome_label`, `mountain_peak`, `boundary`. There is no `background` layer: the canvas stays transparent and the page's CSS grid shows through. The landing page's `lp-grid-bg` and `--lp-grid` are scoped to `.landing`, so the map gets its own small `map-grid-bg` utility in `globals.css` with the same values (`#e4e9fa` light, `#1c1b0e` dark).

**Colours.** Light: ink `#000`, water `#cfe0ff`, water lines `#7aa0e6`, parks `#e3f1dc`. Dark: ink `#fff`, water `#16304d`, water lines `#3a6aa0`, parks `#1b2a16`. These are map-only colours, kept as constants in the style module beside the existing rule that map pins use fixed colours (#324). The grid colour and the hand-drawn marks use theme tokens.

**Theme switching.** The page reads `resolvedTheme` from `next-themes`' `useTheme()` (the same source `theme-toggle.tsx` drives) and calls `map.setStyle(mapStyle(theme))` when it changes. Markers are DOM elements and survive a style change.

## The hand-drawn layer

The household's marks are HTML markers (`maplibregl.Marker` with a custom element), not map layers, so they can use the app's own fonts and CSS tokens.

- **Apartment:** a wobbly pencil circle (an SVG path that does not quite close) with a dot at the exact spot, and the short code beside it in Caveat. Accent colour: `--primary` (blue in light, yellow in dark).
- **Location of interest:** a pencil star with its label in Caveat, in `--destructive` (red / pink), so it is distinguishable from apartments by shape *and* colour.
- **Wobble is deterministic**, seeded from the row id, so a mark keeps its shape across reloads and renders.
- **Label legibility:** the handwritten text gets a background-coloured text shadow (halo) so it stays readable over street lines and printed names.
- An apartment with no short code yet shows its name, truncated.
- Marks are buttons for accessibility: `role="button"`, `aria-label` = "BS-04, CHF 3,100, 104 m², opens apartment", focusable, Enter opens the apartment.

## Interaction

- **Desktop (`(hover: hover)`):** hovering a mark shows the card; leaving the mark and the card hides it; clicking the mark opens `/apartments/<id>`.
- **Touch (`(hover: none)`):** first tap shows the card; tapping the card opens the apartment; tapping the map elsewhere, or panning, closes it.
- **Keyboard:** focusing a mark shows the card; Enter opens the apartment; Escape closes the card.
- **Location of interest:** the card shows the label (and address, if any). Not a link.

### The apartment card

Framed like the rest of the app (3px frame, hard shadow), about 200px wide, placed above the mark and clamped inside the map so it never covers the mark it belongs to and never leaves the screen on a 360px phone.

```
BS-04
CHF 3'100   104 m²   4.5 rooms
★ 4.8                     (or "Not rated")
Bachletten quiet street
Open →
```

- Price as monthly CHF, area in m², rooms; each omitted (not shown as "—") when null.
- Rating is the household average `avgOverall`, one decimal; "Not rated" when null.
- Name in small muted text, one line, truncated.

## The page

- **Route:** `src/app/(app)/map/page.tsx`, inside the shared signed-in layout, so it has the household store and needs no new server route. No `layout.tsx`: like `/compare`, it uses the full width.
- **Nav:** a "Map" item in `src/components/nav-bar.tsx`, after "Compare".
- **Height:** the map fills the viewport below the nav bar (`100dvh` minus the nav), with the "not on the map" line below it.
- **Initial view:** fit all marks, with padding that allows for the handwritten labels (the preview cut BS-05's label off at a phone's right edge), capped at zoom 15 so a single apartment does not zoom to the street.
- **Geocoding:** on mount the page runs `runMaintenance("geocode")`, best-effort, exactly as the apartments page's map does today, so apartments added before they had coordinates appear.
- **Not on the map:** apartments without coordinates are listed under the map — "2 apartments aren't on the map yet: BS-06, BS-07" — each linking to the apartment. Corrupt rows (`corrupt: true`) are left out entirely.
- **Empty:** no apartment and no location has coordinates → the map shows Switzerland at zoom 7 with a short note ("Nothing to show yet — add an apartment with an address"). No apartments at all → the same note links to Upload.
- **Loading / failure:** while the dynamic import loads, a framed placeholder of the map's size. If the map fails to load (tiles unreachable, WebGL unavailable), the page says so and still shows the list of apartments as links, so the page is never a dead end.

## What changes elsewhere

- **Apartments page:** the collapsible Leaflet overview (`ApartmentsOverviewMap`, `apartments-overview-map-inner.tsx`, its `localStorage` key) is removed and replaced by a "View on map" link to `/map`. The geocode pass it triggered moves to the map page. Its tests go with it.
- **Leaflet stays** for the detail page's small map (`apartment-location-map-inner.tsx`). `leaflet` / `react-leaflet` remain dependencies until that is moved too.
- **`docs/security-notes.md`:** a short entry stating that map tiles are fetched from a third party (OpenFreeMap now, OpenStreetMap before), so the tile host learns which area is being viewed — not which apartments, and nothing from the envelope. Pointer to #339. The landing page makes no claim about maps, so its copy does not change.
- **AGENTS.md:** a short "Map page (#330)" section: where the style lives, that the map is the one place third-party tiles load, that the inner component is untestable under jsdom by design, and the pointer to #339.
- **CHANGELOG.md:** an Added line under Unreleased.

## Module layout

```
src/lib/map/style.ts             mapStyle(theme) — pure, no imports from the app
src/lib/map/marks.ts             pencilCirclePath(seed), starPath(), seedFromId(id) — pure
src/lib/map/points.ts            toMapPoints(apartments, locations) → { apartments, locations, missing } — pure
src/lib/map/bounds.ts            initialView(points, viewport) → fit bounds / fallback — pure
src/components/map/apartment-card.tsx   the card (React, testable)
src/components/map/map-mark.tsx         the mark element markup (React, rendered to a node for the Marker)
src/components/map/household-map.tsx    dynamic-import wrapper, loading + failure states, "not on the map" list
src/components/map/household-map-inner.tsx   MapLibre itself — the only file that imports maplibre-gl
src/app/(app)/map/page.tsx       reads useHouseholdData(), runs the geocode pass, renders HouseholdMap
```

`src/lib/map/**` imports nothing from `src/components` or `src/app` (the existing "nothing under `src/lib/` may import from `@/components`" rule). `src/components/map` reads the store only through the page's props, not `useHouseholdData` directly, so the fan-in on the store does not grow.

## Testing

- **Pure modules, unit tested:** `mapStyle` (both themes; building/poi/housenumber layers absent; rivers excluded from the waterway line layer; street names minzoom 14; source URL; no background layer), `marks` (same seed → same path; different ids → different paths), `points` (coordinates present/absent, corrupt rows dropped, short code vs name fallback), `bounds` (one point, many points, none → Switzerland, zoom cap).
- **Components, rendered:** `ApartmentCard` (all fields; nulls omitted; "Not rated"; link target), `HouseholdMap` with the inner component mocked (loading state, failure state with the link list, the "not on the map" line), the map page (geocode pass runs once on mount; empty states), nav bar (Map link present, `aria-current` on `/map`), apartments page ("View on map" link present, overview map gone).
- **`household-map-inner.tsx` is not unit tested**: jsdom has no WebGL. Same posture, and same reasoning, as the Leaflet `*-map-inner.tsx` components in `vitest.config.mts` — it stays counted and reports low, honestly. It is kept thin: everything it does with data comes from the pure modules above.
- **Visual check by hand** before merging, in a real browser on the local database: light and dark, desktop and a 390px viewport, hover and tap.
- Lint, typecheck, `npm run test:coverage`, and `enola check --fail-on=cycles` (new modules under `src/lib/map` and `src/components/map` must not add a cycle).

## Risks

- **OpenFreeMap availability.** It is a free community service with no SLA. If it is down, the page shows its failure state with the list of apartments. #339 removes the dependency.
- **Bundle size.** ~800 KB for MapLibre, on `/map` only. Checked in the build output.
- **WebGL.** Required by MapLibre. Every current browser has it; the failure state covers the rest.
