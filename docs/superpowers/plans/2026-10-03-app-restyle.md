# App-wide restyle (#324) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the signed-in app, `/billing`, `/invitations` and the encryption screens the landing page's neo-brutalist look, from one shared set of tokens, without changing how the landing page looks.

**Architecture:** The palette moves into the app's shadcn tokens in `src/app/globals.css` (hex, light under `:root`, dark under `.dark`); the landing page's `--lp-*` tokens alias them where the values are equal. shadcn base components get the frame/dense treatment; a handful of components that bypass the theme are moved onto semantic tokens; the encryption screens get a shared gate frame. Nothing outside styling, fonts, the PWA colours and one capture script changes.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 (`@theme inline`), shadcn/ui on Base UI, `next/font/google`, Vitest + Testing Library, Playwright (capture script only).

**Spec:** `docs/superpowers/specs/2026-10-03-app-restyle-design.md` (read it first). Visual reference: the design canvas https://claude.ai/artifact/1oFWfXpd5WuczNZh1eNXFy. Where the canvas and spec differ, the spec wins (dark dense line is `#6b6b6b`, not `#5c5c5c`).

## Global Constraints

- Colours are the spec's token table, exactly. Light: background `#ffffff`, foreground `#000000`, card `#ffffff`, primary `#2346ff`, primary-foreground `#ffffff`, soft (secondary/muted/accent) `#e6ecff`, muted-foreground `#3d3d3d`, destructive `#c8102e`, border/input `#1a1a1a`, frame `#000000`, warning `#b45309`, success `#0a7a3d`. Dark: background `#0d0d0d`, foreground `#ffffff`, card `#161616`, primary `#ffe500`, primary-foreground `#000000`, soft `#1f1c00`, muted-foreground `#bdbdbd`, destructive `#ff5c6c`, border/input `#6b6b6b`, frame `#ffffff`, warning `#ffa94d`, success `#4ade80`.
- Shadows: frame `6px 6px 0 #000` / `6px 6px 0 #ffe500`; button `4px 4px 0 #000` / `4px 4px 0 #fff`; pressed `1px 1px 0 #000` / `1px 1px 0 #fff`; hero `10px 10px 0 #2346ff` / `10px 10px 0 #ffe500`.
- `--radius: 0`. `rounded-full` stays round.
- **Frame** (3px `border-frame` + hard shadow): nav bottom edge, cards, dialogs, dropdown/select menus, primary/outline/secondary/destructive buttons, badges (2px, no shadow), and the inputs for search, sort, passphrase and recovery code. **Dense** (1px `border`, no shadow): everything else — table cells, list rows, fields in multi-field forms, separators.
- Fonts: Archivo (`--font-archivo`) and IBM Plex Mono (`--font-plex-mono`) load in the root layout; Caveat (`--font-caveat`) stays landing-only.
- The landing page must look the same before and after. `src/app/__tests__/landing.test.tsx` is not edited.
- Copy does not change anywhere. Layout does not change beyond what styling requires.
- Never `npm run dev` without `TURSO_DATABASE_URL=` (it writes to production otherwise; AGENTS.md).
- Tests are Vitest; test files live in `__tests__/` beside the source. Coverage floors (lines/statements 80, functions 78, branches 75) must still pass.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DSCCBTQQpRGexsTaHH1oAu
  ```
- Work happens on branch `324-app-restyle` (the spec is already committed there). One PR at the end.

## Review Focus

1. **Dark mode on every screen, not just the ones in the canvas** — the invitation page, billing, error page, loading state and the sign-in card must be legible in dark; a reviewer should see each in both themes (Task 1's screenshot list includes them).
2. **The printed recovery kit** — a person prints it to paper; it must print black on white with no grid, shadow or yellow (Task 9 pins it with a test on the print classes).
3. **Keyboard focus** — with borders now black/white, the focus ring must still be visible on buttons, inputs and nav links in both themes (Task 4 keeps `focus-visible:ring` and Task 11's screenshot pass includes a tabbed-to state).
4. **A future palette tweak that breaks legibility** — pinned by the contrast test in Task 2.
5. **The landing page drifting** — aliasing `--lp-*` must not change a pixel; Task 2 compares before/after screenshots of `/` in both themes.

---

### Task 1: Screenshot tooling, and the "before" set

A reviewer needs before/after images of every screen in both themes. `scripts/capture-hero.mjs` already boots a production build on a throwaway SQLite file with invented data; extend it to capture more routes into a folder outside `public/`.

**Files:**
- Modify: `scripts/capture-hero.mjs`
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run capture:screens -- <outDir>` writes `<outDir>/<name>-<theme>.png` for each route below. Used by Task 11.

- [ ] **Step 1: Add a screens mode to the capture script**

In `scripts/capture-hero.mjs`, read the mode from argv near the top constants:

```js
// `node scripts/capture-hero.mjs` writes the landing hero (public/hero/).
// `node scripts/capture-hero.mjs --screens <dir>` instead writes a PNG of
// every signed-in screen, light and dark, into <dir> — before/after images
// for a styling PR (#324). Same throwaway database, same invented data.
const SCREENS_FLAG = process.argv.indexOf("--screens");
const SCREENS_DIR = SCREENS_FLAG === -1 ? null : process.argv[SCREENS_FLAG + 1];
if (SCREENS_FLAG !== -1 && !SCREENS_DIR) {
  throw new Error("usage: capture-hero.mjs --screens <outDir>");
}
const SCREENS = [
  { name: "apartments", path: "/apartments", ready: (p) => p.getByRole("heading", { name: "Apartments" }).waitFor() },
  { name: "apartment-detail", path: `/apartments/${aptId(0)}`, ready: (p) => p.getByRole("heading", { level: 1 }).waitFor() },
  { name: "upload", path: "/apartments/new", ready: (p) => p.getByRole("heading", { level: 1 }).waitFor() },
  { name: "compare", path: "/compare", ready: (p) => p.getByRole("table").waitFor() },
  { name: "household", path: "/household", ready: (p) => p.getByRole("heading", { name: "Household" }).waitFor() },
  { name: "settings", path: "/settings", ready: (p) => p.getByRole("heading", { name: "Settings" }).waitFor() },
  { name: "guide", path: "/guide", ready: (p) => p.getByRole("heading", { level: 1 }).waitFor() },
  { name: "invitations", path: "/invitations", ready: (p) => p.waitForLoadState("networkidle") },
];
```

`aptId` is defined further down in the file; move this `SCREENS` block to just after the `aptId` definition so it is in scope.

- [ ] **Step 2: Branch the capture loop**

Inside the existing `for (const theme of ["light", "dark"])` loop, replace the block from `await page.goto(\`${BASE}/compare\`)` through the `console.log(\`[capture-hero] wrote ${out}\`)` line with:

```js
      if (SCREENS_DIR) {
        mkdirSync(SCREENS_DIR, { recursive: true });
        // The landing page and its sign-in dialog, signed out, first.
        const signedOut = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme });
        await signedOut.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
        const lp = await signedOut.newPage();
        await lp.goto(`${BASE}/`);
        await lp.waitForTimeout(800);
        await lp.screenshot({ path: `${SCREENS_DIR}/landing-${theme}.png`, fullPage: true });
        await lp.getByRole("button", { name: "Sign in" }).click();
        await lp.waitForTimeout(400);
        await lp.screenshot({ path: `${SCREENS_DIR}/sign-in-${theme}.png` });
        await signedOut.close();

        for (const s of SCREENS) {
          await page.goto(`${BASE}${s.path}`);
          await s.ready(page);
          await page.waitForTimeout(800);
          const out = `${SCREENS_DIR}/${s.name}-${theme}.png`;
          await page.screenshot({ path: out, fullPage: true });
          console.log(`[capture-hero] wrote ${out}`);
        }
      } else {
        await page.goto(`${BASE}/compare`);
        await page.getByRole("table").waitFor();
        await page.waitForTimeout(800);

        const png = await page.screenshot();
        const out = `${OUT_DIR}/compare-${theme}.webp`;
        await sharp(png).resize({ width: 1600 }).webp({ quality: 86 }).toFile(out);
        console.log(`[capture-hero] wrote ${out}`);
      }
```

Also change `mkdirSync(OUT_DIR, { recursive: true });` to run only when `!SCREENS_DIR`, so a screens run never touches `public/hero/`.

- [ ] **Step 3: Script and ignore entries**

In `package.json` scripts, after `"capture:hero"`, add:

```json
    "capture:screens": "node scripts/capture-hero.mjs --screens",
```

Append to `.gitignore`:

```
# before/after screenshots for styling PRs (scripts/capture-hero.mjs --screens)
/screens/
```

- [ ] **Step 4: Take the "before" set on the untouched app**

```bash
npm run build && npm run capture:screens -- screens/before
ls screens/before
```

Expected: 20 PNGs (`landing`, `sign-in` and the 8 screens, each `-light` and `-dark`). The script aborts on its own if the server does not report `[db] local file`. If a screen's `ready` wait times out, fix that entry's locator (do not drop the screen) and re-run.

- [ ] **Step 5: Encryption screens "before", by hand**

The capture runs with encryption off, so the gate screens need a manual run on a throwaway database:

```bash
TURSO_DATABASE_URL= LOCAL_DB_URL=file:./data/restyle-gates.db FLATPARE_ENCRYPTION=on FLATPARE_PUBLIC_ACCESS=open APP_PASSWORD=gates GOOGLE_CLIENT_ID= GITHUB_CLIENT_ID= RESEND_API_KEY= STRIPE_SECRET_KEY= npm run start -- -p 3014
```

Confirm the log says `[db] local file — file:./data/restyle-gates.db`. Sign in with password `gates` and screenshot (light and dark, via the theme toggle) into `screens/before/`: `setup` (Choose a passphrase), `recovery-kit` (after setting one), and `unlock` (sign out, sign in again). Stop the server; delete `data/restyle-gates.db`.

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-hero.mjs package.json .gitignore
git commit -m "chore: capture before/after screenshots of every screen (#324)"
```

---

### Task 2: Theme tokens, landing aliases, contrast test

**Files:**
- Create: `src/app/__tests__/theme-contrast.test.ts`
- Modify: `src/app/globals.css` (`@theme inline`, `:root`, `.dark`, `.landing`, `.dark .landing`)

**Interfaces:**
- Produces: Tailwind utilities `border-frame`, `bg-frame`, `text-warning`, `text-success`, `bg-success`, `shadow-frame`, `shadow-button`, `shadow-pressed`, `shadow-hero`; CSS variables `--frame`, `--warning`, `--success`, `--frame-shadow`, `--button-shadow`, `--pressed-shadow`, `--hero-shadow`. Every later task uses these names.

- [ ] **Step 1: Write the failing contrast test**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The app theme's colour pairs must stay legible in both themes (#324).
// Reads the real globals.css so a palette tweak that breaks contrast fails
// here instead of shipping. Thresholds: WCAG 2.2 1.4.3 (text, 4.5:1) and
// 1.4.11 (a form field's boundary, 3:1).
const css = fs.readFileSync(path.join(__dirname, "../globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.search(new RegExp(`^${selector.replace(".", "\\.")} \\{`, "m"));
  if (start === -1) throw new Error(`no ${selector} block in globals.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["warning", "background"],
  ["success", "background"],
];

const BOUNDARY_PAIRS: [string, string][] = [
  ["input", "background"],
  ["input", "card"],
  ["frame", "background"],
  ["frame", "card"],
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("theme contrast — %s", (_name, selector) => {
  const vars = block(selector);

  it.each(TEXT_PAIRS)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BOUNDARY_PAIRS)("%s against %s is at least 3:1", (line, bg) => {
    expect(ratio(vars[line], vars[bg])).toBeGreaterThanOrEqual(3);
  });

  it("squares every corner", () => {
    expect(vars.radius).toBe("0");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: FAIL — `not a 6-digit hex colour: oklch(...)` (the current tokens are oklch) and `radius` is `0.625rem`.

- [ ] **Step 3: Replace `:root` and `.dark` in `globals.css`**

Replace the whole `:root { ... }` block with:

```css
/* The app theme (#324): the landing page's neo-brutalist palette, now the
   single source for the whole product. Light is blue & white, dark is
   black & yellow. Hex, not oklch, so theme-contrast.test.ts can compute
   WCAG ratios and manifest.ts can mirror them. */
:root {
  --background: #ffffff;
  --foreground: #000000;
  --card: #ffffff;
  --card-foreground: #000000;
  --popover: #ffffff;
  --popover-foreground: #000000;
  --primary: #2346ff;
  --primary-foreground: #ffffff;
  --secondary: #e6ecff;
  --secondary-foreground: #000000;
  --muted: #e6ecff;
  --muted-foreground: #3d3d3d;
  --accent: #e6ecff;
  --accent-foreground: #000000;
  --destructive: #c8102e;
  /* The dense line: every plain `border` utility uses it. Frame elements
     opt in to the heavy line with `border-frame`. */
  --border: #1a1a1a;
  --input: #1a1a1a;
  --ring: #2346ff;
  --frame: #000000;
  --warning: #b45309;
  --success: #0a7a3d;
  --frame-shadow: 6px 6px 0 #000000;
  --button-shadow: 4px 4px 0 #000000;
  --pressed-shadow: 1px 1px 0 #000000;
  --hero-shadow: 10px 10px 0 #2346ff;
  --chart-1: #2346ff;
  --chart-2: #000000;
  --chart-3: #3d3d3d;
  --chart-4: #b45309;
  --chart-5: #0a7a3d;
  --radius: 0;
  --sidebar: #ffffff;
  --sidebar-foreground: #000000;
  --sidebar-primary: #2346ff;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e6ecff;
  --sidebar-accent-foreground: #000000;
  --sidebar-border: #1a1a1a;
  --sidebar-ring: #2346ff;
}
```

Replace the whole `.dark { ... }` block with:

```css
.dark {
  --background: #0d0d0d;
  --foreground: #ffffff;
  --card: #161616;
  --card-foreground: #ffffff;
  --popover: #161616;
  --popover-foreground: #ffffff;
  --primary: #ffe500;
  --primary-foreground: #000000;
  --secondary: #1f1c00;
  --secondary-foreground: #ffffff;
  --muted: #1f1c00;
  --muted-foreground: #bdbdbd;
  --accent: #1f1c00;
  --accent-foreground: #ffffff;
  --destructive: #ff5c6c;
  /* #6b6b6b, not the canvas's #5c5c5c: that measured 2.9:1 on #0d0d0d,
     under the 3:1 a form field's edge needs. */
  --border: #6b6b6b;
  --input: #6b6b6b;
  --ring: #ffe500;
  --frame: #ffffff;
  --warning: #ffa94d;
  --success: #4ade80;
  --frame-shadow: 6px 6px 0 #ffe500;
  --button-shadow: 4px 4px 0 #ffffff;
  --pressed-shadow: 1px 1px 0 #ffffff;
  --hero-shadow: 10px 10px 0 #ffe500;
  --chart-1: #ffe500;
  --chart-2: #ffffff;
  --chart-3: #bdbdbd;
  --chart-4: #ffa94d;
  --chart-5: #4ade80;
  --sidebar: #161616;
  --sidebar-foreground: #ffffff;
  --sidebar-primary: #ffe500;
  --sidebar-primary-foreground: #000000;
  --sidebar-accent: #1f1c00;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #6b6b6b;
  --sidebar-ring: #ffe500;
}
```

- [ ] **Step 4: Register the new tokens in `@theme inline`**

In the `@theme inline { ... }` block, after `--color-card: var(--card);`, add:

```css
  --color-frame: var(--frame);
  --color-warning: var(--warning);
  --color-success: var(--success);
  --shadow-frame: var(--frame-shadow);
  --shadow-button: var(--button-shadow);
  --shadow-pressed: var(--pressed-shadow);
  --shadow-hero: var(--hero-shadow);
```

- [ ] **Step 5: Run the contrast test**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: PASS (all pairs, both themes). If a pair fails, the value in Step 3 was mistyped — compare with Global Constraints; do not change a threshold.

- [ ] **Step 6: Alias the landing tokens**

In the `.landing { ... }` block, change only these lines (the rest stay as they are):

```css
  --lp-bg: var(--background);
  --lp-surface: var(--card);
  --lp-ink: var(--foreground);
  --lp-muted: var(--muted-foreground);
  --lp-line-strong: var(--frame);
  --lp-card-line: var(--frame);
  --lp-accent: var(--primary);
  --lp-on-accent: var(--primary-foreground);
  --lp-soft: var(--secondary);
  --lp-card-shadow: var(--frame-shadow);
  --lp-btn-shadow: var(--button-shadow);
  --lp-btn-shadow-pressed: var(--pressed-shadow);
  --lp-hero-shadow: var(--hero-shadow);
```

In the `.dark .landing { ... }` block, **delete** the lines for those same thirteen tokens (they now follow `.dark` through the aliases). Keep every other line in both blocks (`--lp-body`, `--lp-line`, `--lp-chip-line`, `--lp-btn-line`, `--lp-grid`, `--lp-accent-text`, `--lp-hosted-border`, `--lp-toast-shadow`, the video, play, code and map tokens). Update the block's leading comment from "Scoped to `.landing`, so the signed-in app keeps its own theme." to "Shares the app theme's tokens (#324); the `--lp-*` names that differ from it, or exist only here, stay scoped to `.landing`."

- [ ] **Step 7: Prove the landing page did not change**

```bash
npx vitest run src/app/__tests__/landing.test.tsx src/app/__tests__/landing-page.test.tsx
npm run build && npm run capture:screens -- screens/after-tokens
```

Then compare `screens/before/landing-{light,dark}.png` with `screens/after-tokens/landing-{light,dark}.png` (open both; or `npx --yes pixelmatch screens/before/landing-light.png screens/after-tokens/landing-light.png screens/diff-landing-light.png 0.1`). Expected: tests pass; the landing images are identical apart from the sign-in card inside the dialog (not visible in the full-page shot). Any visible landing difference means an alias is wrong — fix it before committing.

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/app/__tests__/theme-contrast.test.ts
git commit -m "feat: the landing page's palette becomes the app theme (#324)"
```

---

### Task 3: Fonts, browser chrome colours, manifest

**Files:**
- Create: `src/app/fonts.ts`
- Modify: `src/app/layout.tsx`, `src/app/_components/landing-fonts.ts`, `src/app/manifest.ts`, `src/app/globals.css` (`@theme inline` font lines)
- Test: `src/app/__tests__/root-layout.test.tsx`, `src/app/__tests__/manifest.test.ts`

**Interfaces:**
- Produces: `appFontVariables: string` from `src/app/fonts.ts` (the `--font-archivo` and `--font-plex-mono` variable classes); `landingFontVariables` now carries only `--font-caveat`.

- [ ] **Step 1: Update the tests first**

In `src/app/__tests__/root-layout.test.tsx`, replace the `next/font/google` mock with:

```ts
vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "--font-archivo" }),
  IBM_Plex_Mono: () => ({ variable: "--font-plex-mono" }),
}));
```

Replace the two `toContain("--font-geist-…")` assertions with:

```ts
    expect(html.className).toContain("--font-archivo");
    expect(html.className).toContain("--font-plex-mono");
```

and the expected `themeColor` with:

```ts
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
    ]);
```

In `src/app/__tests__/manifest.test.ts`, replace the "sets theme and background colours" test with one that ties the manifest to the stylesheet:

```ts
  // AGENTS.md: theme_color / background_color mirror --primary / --background
  // in globals.css. Read the real file so the two cannot drift.
  it("mirrors --primary and --background from the light theme", () => {
    const css = fs.readFileSync(path.join(__dirname, "../globals.css"), "utf8");
    const root = css.slice(css.search(/^:root \{/m));
    const token = (name: string) =>
      new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, "i").exec(root)?.[1];
    expect(m.theme_color).toBe(token("primary"));
    expect(m.background_color).toBe(token("background"));
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/__tests__/root-layout.test.tsx src/app/__tests__/manifest.test.ts`
Expected: FAIL — layout still imports `Geist`; theme colour is `#f9fafb`; manifest is `#00676f`.

- [ ] **Step 3: Create `src/app/fonts.ts`**

```ts
import { Archivo, IBM_Plex_Mono } from "next/font/google";

// The app's two typefaces (#324), shared with the landing page: Archivo for
// text (900 for headings), IBM Plex Mono for numbers, codes and labels.
// A leaf of its own so the root layout stays readable and tests can mock
// next/font/google, which only runs under the Next compiler.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const appFontVariables = `${archivo.variable} ${plexMono.variable}`;
```

- [ ] **Step 4: Use it in the root layout**

In `src/app/layout.tsx`: delete the `Geist, Geist_Mono` import and the `geistSans` / `geistMono` constants; add `import { appFontVariables } from "./fonts";`; change the `<html>` className to `` `${appFontVariables} h-full antialiased` ``; change `themeColor` to:

```ts
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
```

- [ ] **Step 5: Point the theme at the new fonts**

In `globals.css` `@theme inline`, replace the two font lines with:

```css
  --font-sans: var(--font-archivo), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;
```

- [ ] **Step 6: Landing fonts keep only Caveat**

Replace `src/app/_components/landing-fonts.ts` with:

```ts
import { Caveat } from "next/font/google";

// The landing page's own typeface (#301): Caveat, for the handwriting on the
// hero sketch. Archivo and IBM Plex Mono moved to the root layout in #324,
// so the whole app shares them; this one stays here so the signed-in app
// does not download it. A module of its own so tests can stub it —
// next/font only works under the Next compiler.
const caveat = Caveat({ subsets: ["latin"], weight: ["700"], variable: "--font-caveat" });

export const landingFontVariables = caveat.variable;
```

- [ ] **Step 7: Manifest colours**

In `src/app/manifest.ts`:

```ts
// Colours mirror --primary and --background in globals.css (light theme);
// manifest.test.ts reads the stylesheet and fails if they drift.
const THEME = "#2346ff";
const BACKGROUND = "#ffffff";
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/app/__tests__/root-layout.test.tsx src/app/__tests__/manifest.test.ts src/app/__tests__/landing.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/fonts.ts src/app/layout.tsx src/app/_components/landing-fonts.ts src/app/manifest.ts src/app/globals.css src/app/__tests__/root-layout.test.tsx src/app/__tests__/manifest.test.ts
git commit -m "feat: Archivo and IBM Plex Mono across the app; browser and manifest colours follow the theme (#324)"
```

---

### Task 4: Base components — frame and dense

**Files:**
- Modify: `src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `badge.tsx`, `dropdown-menu.tsx`
- Create: `src/components/ui/__tests__/weight.test.tsx` *(test of our own `weight` prop; `src/components/ui/**` is excluded from coverage, but a test about behaviour we added belongs here)*

**Interfaces:**
- Consumes: Task 2's utilities (`border-frame`, `shadow-frame`, `shadow-button`, `shadow-pressed`).
- Produces: `Input`, `Textarea` and `SelectTrigger` accept `weight?: "dense" | "frame"` (default `"dense"`) and render `data-weight="dense" | "frame"`. Task 7 passes `weight="frame"`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "../input";
import { Textarea } from "../textarea";

// #324: fields come in two weights. Dense (1px) is the default, for fields
// inside multi-field forms; frame (3px) is for the few standalone fields —
// search, sort, passphrase, recovery code.
describe("field weight", () => {
  it("defaults to dense", () => {
    render(<Input aria-label="a" />);
    render(<Textarea aria-label="b" />);
    expect(screen.getByLabelText("a").dataset.weight).toBe("dense");
    expect(screen.getByLabelText("b").dataset.weight).toBe("dense");
  });

  it("takes the frame weight when asked", () => {
    render(<Input aria-label="a" weight="frame" />);
    render(<Textarea aria-label="b" weight="frame" />);
    const input = screen.getByLabelText("a");
    expect(input.dataset.weight).toBe("frame");
    expect(input.className).toMatch(/border-3/);
    expect(input.className).toMatch(/border-frame/);
    expect(screen.getByLabelText("b").dataset.weight).toBe("frame");
  });

  it("does not pass weight through to the DOM as an attribute", () => {
    render(<Input aria-label="a" weight="frame" />);
    expect(screen.getByLabelText("a").hasAttribute("weight")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/ui/__tests__/weight.test.tsx`
Expected: FAIL — `data-weight` is undefined.

- [ ] **Step 3: Input**

Replace the `Input` function in `src/components/ui/input.tsx` with:

```tsx
// #324: `weight` picks the line. "dense" (1px, the default) for fields inside
// multi-field forms; "frame" (3px) for standalone fields — search, sort,
// passphrase, recovery code.
const FIELD_WEIGHT = {
  dense: "border border-input",
  frame: "border-3 border-frame",
} as const

function Input({
  className,
  type,
  weight = "dense",
  ...props
}: React.ComponentProps<"input"> & { weight?: keyof typeof FIELD_WEIGHT }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-weight={weight}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        FIELD_WEIGHT[weight],
        weight === "frame" && "h-11",
        className
      )}
      {...props}
    />
  )
}

export { Input, FIELD_WEIGHT }
```

(The original class string minus `border border-input`; `rounded-lg` now resolves to 0 through `--radius`.)

- [ ] **Step 4: Textarea and SelectTrigger**

In `src/components/ui/textarea.tsx`, add `import { FIELD_WEIGHT } from "./input"`, take `weight = "dense"` the same way (`React.ComponentProps<"textarea"> & { weight?: keyof typeof FIELD_WEIGHT }`), set `data-weight={weight}`, remove `border border-input` from the class string and add `FIELD_WEIGHT[weight]` after it inside `cn(...)`.

In `src/components/ui/select.tsx` `SelectTrigger`: add `weight = "dense"` to the destructured props and `weight?: "dense" | "frame"` to its props type, import `FIELD_WEIGHT` from `./input`, set `data-weight={weight}` on `SelectPrimitive.Trigger`, remove `border border-input` from its class string and add `FIELD_WEIGHT[weight], weight === "frame" && "h-11"` inside `cn(...)` before `className`.

- [ ] **Step 5: Run the weight test**

Run: `npx vitest run src/components/ui/__tests__/weight.test.tsx`
Expected: PASS.

- [ ] **Step 6: Button**

In `src/components/ui/button.tsx`, in the base class string replace `rounded-lg border border-transparent` with `rounded-lg border-3 border-transparent` and `active:not-aria-[haspopup]:translate-y-px` with `active:not-aria-[haspopup]:translate-x-[3px] active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-pressed motion-reduce:active:translate-x-0 motion-reduce:active:translate-y-0`; add `font-semibold` after `text-sm` and remove `font-medium`. Replace the variant map with:

```ts
      variant: {
        default:
          "border-black bg-primary text-primary-foreground shadow-button [a]:hover:bg-primary/90",
        outline:
          "border-frame bg-card text-foreground shadow-button hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "border-frame bg-secondary text-secondary-foreground shadow-button hover:bg-secondary/80 aria-expanded:bg-secondary",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "border-destructive bg-card text-destructive shadow-button hover:bg-destructive/10 focus-visible:ring-destructive/30",
        link: "border-0 text-primary underline-offset-4 hover:underline",
      },
```

(`border-black` on the primary button in both themes is the landing page's `--lp-btn-line`.) Sizes stay as they are.

- [ ] **Step 7: Card, badge, menus**

- `card.tsx` `Card`: replace `ring-1 ring-foreground/10` with `border-3 border-frame shadow-frame`.
- `badge.tsx`: in the base string replace `rounded-4xl border border-transparent` with `rounded-4xl border-2 border-transparent font-mono uppercase tracking-wide` and `font-medium` with `font-semibold`; in `outline` replace `border-border` with `border-frame`.
- `dropdown-menu.tsx` (both popup class strings, lines ~44 and ~138) and `select.tsx` (popup, line ~86): replace `shadow-md ring-1 ring-foreground/10` / `shadow-lg ring-1 ring-foreground/10` with `border-3 border-frame shadow-frame`.

- [ ] **Step 8: Run the UI-touching suites**

Run: `npx vitest run src/components src/app && npm run typecheck && npm run lint`
Expected: PASS. A failure here means a test asserted on an old class (`ring-1`, `font-medium`); change that assertion to the behaviour it was guarding, not to the new class name.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui
git commit -m "feat: frame and dense weights for the base components (#324)"
```

---

### Task 5: Headings

Utilities override `@layer base`, and every heading in the app carries `font-semibold`, so the heading look is two named utilities applied in place.

**Files:**
- Modify: `src/app/globals.css`
- Modify (headings): `src/app/(app)/apartments/page.tsx:248`, `src/app/(app)/apartments/[id]/page.tsx:290`, `src/app/(app)/apartments/new/page.tsx:261`, `src/app/(app)/apartments/new/_components/review-step.tsx:55`, `src/app/(app)/apartments/new/_components/upload-step.tsx:18`, `src/app/(app)/compare/page.tsx:130`, `src/app/(app)/household/page.tsx:14`, `src/app/(app)/settings/page.tsx:12`, `src/app/billing/page.tsx:34`, `src/app/invitations/page.tsx:70`, `src/app/error.tsx:22`, `src/components/crypto/{household-key-screen,pending-screen,recovery-kit,setup-screen,unlock-screen}.tsx` (the `<h1>`), `src/components/crypto/encryption-settings.tsx:23,72`, `src/components/crypto/forgot-passphrase.tsx:157,184`, `src/components/household-settings.tsx:205`, `src/components/locations-settings.tsx:184,312`

**Interfaces:**
- Produces: utilities `title-page` and `title-section`.

- [ ] **Step 1: Add the utilities**

In `globals.css`, after the `tap-target` utility:

```css
/* Heading styles from the landing page (#324). Utilities rather than base
   styles, because utilities win over @layer base and would otherwise be
   overridden by a heading's own font-weight class. */
@utility title-page {
  font-size: 2.125rem;
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: -0.03em;
  @media (width >= 40rem) {
    font-size: 2.75rem;
  }
}
@utility title-section {
  font-size: 1.375rem;
  line-height: 1.15;
  font-weight: 900;
  letter-spacing: -0.02em;
}
```

- [ ] **Step 2: Apply them**

For every `<h1>` in the file list: replace its size and weight classes (`text-2xl font-semibold`, `text-xl font-semibold`, `text-lg font-semibold`, and `tracking-tight` on billing) with `title-page`, keeping any other classes. For every `<h2>` in the list **except** `distance-section.tsx:18` (a small uppercase label — leave it): replace `text-lg font-semibold` / `text-lg font-medium` / `font-semibold` with `title-section`. Also update `.guide-prose h1` to `@apply mt-0 mb-4 title-page;` and `.guide-prose h2` to `@apply mt-10 mb-4 border-b pb-2 title-section;`.

- [ ] **Step 3: Run the suites**

Run: `npx vitest run src && npm run typecheck`
Expected: PASS (tests query headings by role and name, not by class).

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "feat: heavy Archivo headings across the app (#324)"
```

---

### Task 6: Nav bar

**Files:**
- Modify: `src/components/nav-bar.tsx`
- Test: `src/components/__tests__/nav-bar.test.tsx` (exists; its mocks already set `usePathname` to `/apartments` and stub `next-auth/react` and `@/lib/crypto`)

**Interfaces:**
- Produces: nav links carry `aria-current="page"` for the current section (styling keys off it).

- [ ] **Step 1: Write the failing test**

Append to `src/components/__tests__/nav-bar.test.tsx`:

```tsx
describe("NavBar current section", () => {
  // The mocked pathname is /apartments. The current section is a filled
  // block (#324); aria-current is what says so to a screen reader, and what
  // the styling keys off. Both navs (desktop and mobile) carry it.
  it("marks the current section with aria-current in both navs", () => {
    render(<NavBar userName="Alice" />);
    const current = screen.getAllByRole("link", { name: "Apartments" });
    expect(current).toHaveLength(2);
    for (const link of current) expect(link.getAttribute("aria-current")).toBe("page");
    for (const link of screen.getAllByRole("link", { name: "Compare" })) {
      expect(link.hasAttribute("aria-current")).toBe(false);
    }
  });
});
```

The logo link (`/apartments`) has the accessible name "Flatpare" from its image, so it does not match `{ name: "Apartments" }`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/__tests__/nav-bar.test.tsx`
Expected: FAIL — no `aria-current`.

- [ ] **Step 3: Restyle**

In `nav-bar.tsx`:
- `<header className="border-b bg-background">` → `<header className="border-b-3 border-frame bg-card">`.
- Desktop links: add `aria-current={pathname === item.href ? "page" : undefined}` and change the class to:

```tsx
              className={cn(
                "border-2 border-transparent px-3 py-1.5 text-sm font-bold transition-colors",
                pathname === item.href
                  ? "border-frame bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              )}
```

- Mobile bottom nav: `border-t` → `border-t-3 border-frame`, background `bg-card`; links get the same `aria-current`, and the current one `bg-primary font-bold text-primary-foreground` instead of `font-medium text-foreground`.
- The user-menu trigger: `rounded-md` stays (resolves to 0); `hover:bg-accent` → `hover:bg-muted`.
- The logo `<Image>` is unchanged.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/components/__tests__/nav-bar.test.tsx src/app/__tests__/app-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav-bar.tsx src/components/__tests__/nav-bar.test.tsx
git commit -m "feat: nav bar marks the current section as a filled block (#324)"
```

---

### Task 7: Semantic colours instead of hard-coded ones

**Files:**
- Modify: `src/app/(app)/compare/_components/compare-table.tsx`, `src/components/credit-balance.tsx`, `src/components/star-rating.tsx`, `src/app/(app)/apartments/new/_components/status-badge.tsx`, `src/app/(app)/apartments/new/_components/review-step.tsx:111`, `src/app/(app)/apartments/_components/apartment-badges.tsx`
- Test: `src/app/(app)/compare/_components/__tests__/compare-table.test.tsx`, `src/components/__tests__/credit-balance.test.tsx`

**Interfaces:**
- Produces: best-value cells in the compare table carry `data-best="true"`.

- [ ] **Step 1: Move the tests off colour classes**

In `compare-table.test.tsx`, every `expect(x.className).toContain("text-green-600")` becomes `expect(x.dataset.best).toBe("true")` and every `.not.toContain("text-green-600")` becomes `expect(x.dataset.best).toBeUndefined()`. Rename the tests from "…in green…" to "…as the best value…" (e.g. `"highlights the cheapest rent as the best value (min direction)"`, `"renders ✓ when true and marks it as the best value"`, `"renders ✕ when false (not marked best)"`).

In `credit-balance.test.tsx`, rename `"is orange when low and red when empty"` to `"uses the warning colour when low and the destructive one when empty"` and change `toMatch(/text-orange-/)` to `toMatch(/text-warning/)`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run "src/app/(app)/compare/_components/__tests__/compare-table.test.tsx" src/components/__tests__/credit-balance.test.tsx`
Expected: FAIL — `data-best` undefined; `text-orange-600` present.

- [ ] **Step 3: Compare table**

In `compare-table.tsx`, for the metric cells:

```tsx
                    <td
                      key={apt.id}
                      data-best={isBest ? "true" : undefined}
                      className={cn(
                        "px-4 py-2 font-mono",
                        isBest && "bg-secondary font-semibold dark:bg-primary dark:text-primary-foreground"
                      )}
                    >
```

and for the washing-machine cell replace `apt.hasWashingMachine === true && "font-semibold text-green-600"` with `apt.hasWashingMachine === true && "bg-secondary font-semibold dark:bg-primary dark:text-primary-foreground"` and add `data-best={apt.hasWashingMachine === true ? "true" : undefined}`. Add `font-mono` to the distance cells (`"px-4 py-2 text-xs"` → `"px-4 py-2 font-mono text-xs"`). Wrap the table's scroll container (the element with `overflow-x-auto` around `<table>`) in `border-3 border-frame bg-card`, and give the header row's cells `border-b-3 border-frame`.

- [ ] **Step 4: The other five files**

- `credit-balance.tsx`: `"text-orange-600 dark:text-orange-400"` → `"text-warning"`; add `font-mono` to the number's class list.
- `star-rating.tsx`: `hover:text-yellow-400` → `hover:text-primary/70`; `text-yellow-500` → `text-primary`.
- `status-badge.tsx`: `"bg-green-100 text-green-700"` → `"bg-success/15 text-success"`; `"bg-blue-100 text-blue-700"` → `"bg-secondary text-secondary-foreground"`.
- `review-step.tsx:111`: `"text-xs text-amber-700 dark:text-amber-400"` → `"text-xs text-warning"`.
- `apartment-badges.tsx`: the red badge → `"gap-1 border-destructive bg-card text-destructive"`; the green badge → `"gap-1 border-success bg-card text-success"`.

- [ ] **Step 5: Confirm no hard-coded palette colours remain**

```bash
git ls-files 'src/*.tsx' | grep -v __tests__ | grep -v 'src/components/ui/' | xargs -d '\n' grep -n -E '\b(text|bg|border)-(red|orange|amber|yellow|green|emerald|blue|sky)-[0-9]+' || echo "none"
```

Expected: `none`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat: semantic success, warning and best-value colours (#324)"
```

---

### Task 8: Frame-weight fields and screen touch-ups

Styling-only adjustments the base components cannot make on their own. No behaviour changes; the check is the screenshot pass in Task 11.

**Files:**
- Modify: `src/app/(app)/apartments/page.tsx` (search `<Input` ~225, sort `<SelectTrigger` ~267), `src/app/(app)/compare/page.tsx` (`<SelectTrigger` ~137), `src/components/crypto/unlock-screen.tsx` (`<Input` ~43), `src/components/crypto/setup-screen.tsx` (`<Input` ~53, ~63), `src/components/crypto/forgot-passphrase.tsx` (recovery code `<Input` ~187; the two at ~36/~46 are passphrase fields — frame as well), `src/app/(app)/apartments/_components/apartment-card.tsx`, `apartment-row.tsx`, `src/app/(app)/apartments/[id]/page.tsx`, `src/components/apartment-rating-panel.tsx`, `src/components/short-code.tsx`, `src/components/crypto/crypto-provider.tsx:276` (notice toast)

- [ ] **Step 1: Frame weight on the standalone fields**

Add `weight="frame"` to each `<Input>` / `<SelectTrigger>` listed above.

- [ ] **Step 2: Numbers in mono**

Add `font-mono` to: the rent/rooms/size line in `apartment-card.tsx` and `apartment-row.tsx`, the facts values on the detail page, the score shown in `apartment-rating-panel.tsx`, and the code in `short-code.tsx`. Use the rendered labels (e.g. `CHF`, `m²`) to find the elements; change only the class.

- [ ] **Step 3: Rating score buttons**

In `apartment-rating-panel.tsx`, if scores are chosen with buttons, give the selected one `bg-primary text-primary-foreground border-3 border-frame shadow-button` and the others `border-3 border-frame bg-card`. If it uses `StarRating`, Task 7 already covered it — skip this step.

- [ ] **Step 4: Toast**

`crypto-provider.tsx` notice: `"… rounded-md border bg-background px-4 py-2 text-sm shadow …"` → `"… border-3 border-frame bg-card px-4 py-2 text-sm font-semibold shadow-frame …"` (keep the positioning classes).

- [ ] **Step 5: Run the suites**

Run: `npx vitest run src && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat: frame-weight standalone fields, mono numbers, framed toast (#324)"
```

---

### Task 9: The encryption gate frame, and the printed recovery kit

**Files:**
- Create: `src/components/crypto/gate-frame.tsx`
- Modify: `src/components/crypto/crypto-provider.tsx` (the four `body = <…Screen/>` assignments), `src/components/crypto/recovery-kit.tsx`
- Test: `src/components/crypto/__tests__/gate-frame.test.tsx`

**Interfaces:**
- Produces: `GateFrame({ children }: { children: React.ReactNode })` — imports nothing from the app (a leaf), so it adds no edge to the provider/screen graph that `no-import-cycle.test.ts` guards.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GateFrame } from "../gate-frame";

describe("GateFrame", () => {
  it("frames the screen it wraps", () => {
    render(<GateFrame><p>inside</p></GateFrame>);
    expect(screen.getByText("inside")).toBeInTheDocument();
    expect(screen.getByTestId("gate-frame").className).toMatch(/shadow-hero/);
  });

  // The recovery kit is printed on paper: no grid, no shadow, no border,
  // no yellow (#324 review focus).
  it("drops every decoration when printed", () => {
    render(<GateFrame><p>inside</p></GateFrame>);
    const card = screen.getByTestId("gate-frame");
    const page = card.parentElement!;
    for (const cls of ["print:shadow-none", "print:border-0", "print:bg-white", "print:text-black"]) {
      expect(card.className).toContain(cls);
    }
    expect(page.className).toContain("print:bg-none");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/crypto/__tests__/gate-frame.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `gate-frame.tsx`**

```tsx
// The full-screen gate look for the encryption screens (#324): the landing
// page's grid behind a framed card with the hero shadow. A leaf — it imports
// nothing from the app — so wrapping the screens in crypto-provider adds no
// edge to the graph no-import-cycle.test.ts guards. Everything decorative is
// dropped in print, because the recovery kit is printed on paper.
export function GateFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-start justify-center bg-[linear-gradient(var(--muted)_2px,transparent_2px),linear-gradient(90deg,var(--muted)_2px,transparent_2px)] bg-[size:48px_48px] px-4 py-10 sm:py-16 print:bg-none print:p-0">
      <div
        data-testid="gate-frame"
        className="w-full max-w-md border-3 border-frame bg-card p-6 shadow-hero sm:p-8 print:max-w-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none"
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wrap the four screens**

In `crypto-provider.tsx`, import `{ GateFrame } from "./gate-frame"` and wrap the bodies for `needs-setup`, `pending-wrap`, `needs-household-key` and `locked`, e.g. `body = <GateFrame><SetupScreen /></GateFrame>;`. Leave `loading` and `error` as they are. In each screen's own root `<div className="mx-auto max-w-md …">` (unlock, setup, pending, household-key, recovery-kit), remove `mx-auto max-w-md` — the frame now sets the width. Keep the existing `print:` classes in `recovery-kit.tsx`.

- [ ] **Step 5: Run the crypto suites**

Run: `npx vitest run src/components/crypto && npm run typecheck`
Expected: PASS, including `no-import-cycle.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/components/crypto
git commit -m "feat: encryption screens in a framed gate; the recovery kit still prints plain (#324)"
```

---

### Task 10: Map markers

Map tiles do not follow the theme, so marker colours are fixed. The Leaflet `*-map-inner.tsx` files are untested by design (AGENTS.md); the check is the screenshot.

**Files:**
- Modify: `src/components/apartment-location-map-inner.tsx`, `src/components/apartments-overview-map-inner.tsx`, `src/app/globals.css` (`.flatpare-marker-label*`)

- [ ] **Step 1: Markers**

In both files, the pin path's `stroke="white" stroke-width="1.5"` → `stroke="#000000" stroke-width="2"`. In `apartment-location-map-inner.tsx`, `fill="#2563eb"` → `fill="#2346ff"`. In `apartments-overview-map-inner.tsx`:

```ts
// Fixed colours (#324): map tiles do not follow the theme. Brand blue for
// apartments, orange for places; the pins share a shape, so the colours
// also differ in lightness and do not rely on hue alone.
const APT_ICON = makeIcon("#2346ff");
const LOC_ICON = makeIcon("#d9480f");
```

- [ ] **Step 2: Marker labels**

In `globals.css` replace the three `.flatpare-marker-label*` rules' bodies with:

```css
.flatpare-marker-label {
  background: #ffffff;
  color: #000000;
  border: 2px solid #000000;
  border-radius: 0;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  box-shadow: 2px 2px 0 #000000;
}
```

(keep `.flatpare-marker-label::before { display: none; }`) and

```css
.flatpare-marker-label-location {
  background: #fff1e6;
  color: #7a2a05;
  border-color: #7a2a05;
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck
git add src/components/apartment-location-map-inner.tsx src/components/apartments-overview-map-inner.tsx src/app/globals.css
git commit -m "feat: map markers in brand blue and orange with a black outline (#324)"
```

---

### Task 11: After screenshots, hero, docs, verification, PR

**Files:**
- Modify: `public/hero/compare-light.webp`, `public/hero/compare-dark.webp` (regenerated), `AGENTS.md`, `CHANGELOG.md`

- [ ] **Step 1: After screenshots and review**

```bash
npm run build && npm run capture:screens -- screens/after
```

Repeat Task 1 Step 5 for `setup`, `recovery-kit` and `unlock` into `screens/after/`, and additionally print-preview the recovery kit (Chrome: Ctrl+P) and screenshot it as `recovery-kit-print.png`. Open each before/after pair, light and dark. Check, and fix in the owning task's files before going on:
- every screen in the list, in dark mode, is legible (Review Focus 1);
- tab once to a button, an input and a nav link on `/apartments` — the focus ring is visible in both themes (Review Focus 3); screenshot as `focus-{light,dark}.png`;
- `landing-*` is unchanged from `before` (Review Focus 5);
- the printed kit is black on white with no grid or shadow (Review Focus 2).

- [ ] **Step 2: Regenerate the landing hero**

```bash
npm run capture:hero
git add public/hero
```

- [ ] **Step 3: AGENTS.md**

- In **Landing page (E7)**, replace "The look is **scoped to `.landing`** in `globals.css` (`--lp-*` tokens, dark under `.dark .landing`), so the signed-in app keeps its own theme; the fonts (Archivo, IBM Plex Mono, Caveat) load in `src/app/_components/landing-fonts.ts`, not the root layout, and tests stub that module because `next/font` only runs under the Next compiler." with: "Since #324 the landing page and the app share one palette: `--lp-*` tokens alias the app's theme tokens where the values match, and only landing-only values (video, sketch, map doodle, code, grid, chip and hosted-card lines) stay scoped to `.landing`. Archivo and IBM Plex Mono load in the root layout (`src/app/fonts.ts`); Caveat, used only by the hero sketch, loads in `landing-fonts.ts`. Tests stub both because `next/font` only runs under the Next compiler."
- In **PWA**, replace the `theme_color` sentence with: "`theme_color` / `background_color` mirror `--primary` / `--background` (light theme) in `globals.css`; `manifest.test.ts` reads the stylesheet and fails if they drift. The root layout's viewport `themeColor` is `--background` per theme."
- Add a section **Theme (#324)** after **PWA**:

```markdown
## Theme (#324)
- **One palette for the landing page and the app**, as hex tokens in `src/app/globals.css` (`:root` light, `.dark` dark). Design: `docs/superpowers/specs/2026-10-03-app-restyle-design.md`.
- **Frame vs dense.** Frame = 3px `border-frame` + a hard shadow (`shadow-frame`, `shadow-button`, `shadow-hero`): nav edge, cards, dialogs, menus, buttons, badges (2px), and standalone fields. Dense = 1px `border` (the default for every `border` utility), no shadow: table cells, list rows, fields in multi-field forms. `Input`, `Textarea` and `SelectTrigger` take `weight="dense" | "frame"`; default dense.
- **`theme-contrast.test.ts` reads `globals.css`** and fails if a text pair drops under 4.5:1 or a field edge under 3:1, in either theme. Change a colour and that test tells you whether it is legible.
- **Colours come from tokens, never Tailwind's palette** (`text-green-600` and friends): `success`, `warning`, `destructive`, `primary`, `secondary`. The one exception is the Leaflet markers, which sit on map tiles that do not follow the theme.
- **`src/components/ui/*` are edited shadcn files.** Re-running `npx shadcn add <component>` overwrites the restyle; re-apply it by hand.
- **Before/after screenshots:** `npm run build && npm run capture:screens -- screens/<name>` (gitignored). Same throwaway database and invented data as `capture:hero`.
```

- [ ] **Step 4: CHANGELOG**

Under `## Unreleased`, add a `### Changed` line (create the heading if absent):

```markdown
- The whole app now has the landing page's look: blue and white in light mode, black and yellow in dark, square corners, bold frames and the same typefaces. (#324)
```

- [ ] **Step 5: Full verification**

```bash
npm run lint && npm run typecheck && npm run test:coverage
enola check --fail-on=cycles
```

Expected: lint/typecheck clean; all tests pass and coverage thresholds hold; enola reports no new cycle (`src/app/fonts.ts` and `gate-frame.tsx` are leaves). If the machine is loaded and a test times out, re-run that file alone before concluding anything; report the outcome honestly either way.

- [ ] **Step 6: Commit and open the PR**

```bash
git add AGENTS.md CHANGELOG.md public/hero
git commit -m "docs: the shared theme, and the hero re-captured in it (#324)"
git push -u origin 324-app-restyle
gh pr create --title "feat: the landing page's look across the whole app (#324)" --body-file <body>
```

The PR body summarises the spec's decisions, lists the tasks' commits, states the test and coverage results, and links the design canvas. Attach the before/after screenshots (light and dark per screen, plus focus and print) as images in a PR comment — they are gitignored, not committed. End the body with:

```
Closes #324

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01DSCCBTQQpRGexsTaHH1oAu
```
