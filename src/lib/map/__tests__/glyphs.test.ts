import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { FONT_DIRS, glyphPath, rangeName, SHIPPED_RANGES } from "../glyphs";

describe("glyphPath", () => {
  it("maps a shipped range of a known font to its file", () => {
    expect(glyphPath("flatpare-glyphs://Noto%20Sans%20Regular/0-255")).toBe("/map-fonts/noto-sans-regular/0-255.pbf");
    expect(glyphPath("flatpare-glyphs://Noto Sans Bold/8192-8447")).toBe("/map-fonts/noto-sans-bold/8192-8447.pbf");
  });

  it("answers null for a range we do not ship, an unknown font or a malformed URL", () => {
    expect(glyphPath("flatpare-glyphs://Noto%20Sans%20Regular/1536-1791")).toBeNull();
    expect(glyphPath("flatpare-glyphs://Comic%20Sans/0-255")).toBeNull();
    expect(glyphPath("flatpare-glyphs://Noto%20Sans%20Regular/0-511")).toBeNull();
    expect(glyphPath("flatpare-glyphs://Noto%20Sans%20Regular/../../x")).toBeNull();
    expect(glyphPath("flatpare-glyphs://%E0%A4%A/0-255")).toBeNull();
    expect(glyphPath("flatpare-glyphs://no-slash")).toBeNull();
    expect(glyphPath("https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf")).toBeNull();
  });

  it("has every shipped file in public/map-fonts/, with the fonts' licence", () => {
    for (const dir of Object.values(FONT_DIRS)) {
      for (const start of SHIPPED_RANGES) {
        expect(existsSync(join("public", "map-fonts", dir, `${rangeName(start)}.pbf`))).toBe(true);
      }
    }
    expect(existsSync(join("public", "map-fonts", "OFL.txt"))).toBe(true);
  });

  it("covers every font the style asks for", async () => {
    const { mapStyle, OPENFREEMAP } = await import("../style");
    const fonts = new Set(
      mapStyle("light", OPENFREEMAP).layers.flatMap((l) => ((l.layout as { "text-font"?: string[] })?.["text-font"] ?? []))
    );
    for (const font of fonts) expect(FONT_DIRS[font]).toBeDefined();
  });
});
