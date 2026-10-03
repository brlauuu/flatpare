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
});

// Defined once on :root and inherited by .dark, so checked once.
it("squares every corner", () => {
  expect(block(":root").radius).toBe("0");
});

// The recovery kit is printed on paper (#324 review focus). Printing from
// dark mode must still produce dark text on white, so a print-only .dark
// block puts the light palette back for every colour token dark redefines.
it("prints in the light palette even from dark mode", () => {
  const at = css.indexOf("@media print");
  expect(at).toBeGreaterThan(-1);
  const printCss = css.slice(at);
  const start = printCss.search(/\.dark \{/);
  expect(start).toBeGreaterThan(-1);
  const body = printCss.slice(printCss.indexOf("{", start) + 1, printCss.indexOf("}", start));
  const printed: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) printed[m[1]] = m[2].trim();
  const light = block(":root");
  for (const name of Object.keys(block(".dark"))) {
    expect(printed[name], `--${name} in the print block`).toBe(light[name]);
  }
});

// #324 final review: the default focus outline must be full strength too.
it("never draws the focus outline at half strength", () => {
  expect(css).not.toContain("outline-ring/50");
});
