import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifest from "../manifest";

const m = manifest();

// These assertions are the installability contract, not decoration: a browser
// refuses to offer "install" if any of them regresses.
describe("web app manifest", () => {
  it("declares a name and short name", () => {
    expect(m.name).toBe("Flatpare");
    expect(m.short_name).toBe("Flatpare");
  });

  it("launches standalone from the root", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
  });

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

  it("ships the 192px and 512px icons browsers require", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("ships a maskable icon so Android does not clip the mark", () => {
    const maskable = (m.icons ?? []).filter((i) =>
      String(i.purpose ?? "").includes("maskable")
    );
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe("512x512");
  });

  it("points every icon at a file that exists in public/", () => {
    for (const icon of m.icons ?? []) {
      const file = path.join(process.cwd(), "public", String(icon.src));
      expect(fs.existsSync(file), `missing ${icon.src}`).toBe(true);
    }
  });

  it("ships the apple-touch-icon iOS uses instead of the manifest", () => {
    const file = path.join(process.cwd(), "public", "apple-touch-icon.png");
    expect(fs.existsSync(file)).toBe(true);
  });
});
