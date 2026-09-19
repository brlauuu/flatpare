/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// A guard for the cycle #255 removed, because nothing else can catch it.
//
// enola's cycle gate works at MODULE (directory) level, so a loop entirely
// inside src/components/crypto is structurally invisible to it — AGENTS.md
// already records that as a known limit, measured not assumed. Which is
// exactly how three cycles lived here unnoticed: the provider imports the
// screens to render them, and each screen imported `useCrypto` back from the
// provider.
//
// The fix was crypto-context.ts. These two assertions are what keep it fixed.

const DIR = path.join(process.cwd(), "src/components/crypto");

function valueImports(file: string): string[] {
  const src = fs.readFileSync(path.join(DIR, file), "utf8");
  const specs: string[] = [];
  // Value imports only — `import type { X } from "y"` cannot form a runtime
  // cycle and is not what this guards against.
  const re = /import\s+(?!type\s)([\s\S]*?)from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const named = m[1].match(/\{([\s\S]*)\}/);
    const allTypes =
      named && named[1].split(",").every((s) => !s.trim() || /^\s*type\s/.test(s));
    if (!allTypes) specs.push(m[2]);
  }
  return specs;
}

// Every file the provider renders. Any of these importing the provider back
// re-creates the cycle.
const SCREENS = [
  "setup-screen.tsx",
  "unlock-screen.tsx",
  "forgot-passphrase.tsx",
  "pending-screen.tsx",
  "household-key-screen.tsx",
  "recovery-kit.tsx",
  "encryption-settings.tsx",
];

describe("src/components/crypto has no import cycle", () => {
  it.each(SCREENS)("%s does not import crypto-provider", (file) => {
    // The screens need the context, not the provider. `useCrypto` lives in
    // crypto-context.ts precisely so they can have one without the other.
    expect(valueImports(file)).not.toContain("./crypto-provider");
  });

  it("crypto-context.ts stays a leaf", () => {
    // If this file ever imports a screen — or the provider — the cycle is
    // straight back, and enola will not tell anyone.
    const imports = valueImports("crypto-context.ts");
    expect(imports).toEqual(["react"]);
  });

  it("the provider is still the one importing the screens", () => {
    // Guards the fix being "solved" in the wrong direction: hoisting the
    // rendering out of the provider would also break the cycle, but would
    // change the design rather than the wiring.
    const imports = valueImports("crypto-provider.tsx");
    expect(imports).toContain("./crypto-context");
    expect(imports).toContain("./setup-screen");
    expect(imports).toContain("./unlock-screen");
  });
});
