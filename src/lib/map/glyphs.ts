// The map's label fonts, served from public/map-fonts/ when the map reads
// our own data (#339), so drawing a label contacts nobody either. Only the
// European ranges are shipped (Latin, Greek, Cyrillic, punctuation): about
// 2.6 MB for the three fonts, against 103 MB for every range. Chinese,
// Japanese and Korean are never requested at all — MapLibre draws them with
// a local font (`localIdeographFontFamily`, on by default).
//
// MapLibre asks for glyphs through GLYPH_PROTOCOL, so a range that is not
// shipped is answered with an empty set (that one label goes without those
// characters) rather than a 404, which before the first load would count as
// a fatal map error (errors.ts).

export const GLYPH_PROTOCOL = "flatpare-glyphs";
export const SELF_GLYPHS_URL = `${GLYPH_PROTOCOL}://{fontstack}/{range}`;
export const FONTS_DIR = "map-fonts";

export const FONT_DIRS: Record<string, string> = {
  "Noto Sans Regular": "noto-sans-regular",
  "Noto Sans Bold": "noto-sans-bold",
  "Noto Sans Italic": "noto-sans-italic",
};

// First code point of each shipped 256-wide range.
export const SHIPPED_RANGES: readonly number[] = [0, 256, 512, 768, 1024, 7680, 7936, 8192, 8448, 8704];

export function rangeName(start: number): string {
  return `${start}-${start + 255}`;
}

// The file for a glyph request, or null when it is not shipped.
export function glyphPath(url: string): string | null {
  const prefix = `${GLYPH_PROTOCOL}://`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const slash = rest.lastIndexOf("/");
  if (slash < 0) return null;
  let fontstack: string;
  try {
    fontstack = decodeURIComponent(rest.slice(0, slash));
  } catch {
    return null;
  }
  const dir = FONT_DIRS[fontstack];
  const match = /^(\d+)-(\d+)$/.exec(rest.slice(slash + 1));
  if (!dir || !match) return null;
  const start = Number(match[1]);
  if (Number(match[2]) !== start + 255 || !SHIPPED_RANGES.includes(start)) return null;
  return `/${FONTS_DIR}/${dir}/${rangeName(start)}.pbf`;
}
