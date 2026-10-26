// One HTTP byte range (#339): MapLibre reads the map file in small pieces,
// each a `Range: bytes=start-end` request. Only a single range is
// supported, which is all the PMTiles reader sends. A leaf, tested alone.

export type ByteRange = { start: number; end: number } | "none" | "unsatisfiable";

export function parseByteRange(header: string | null, size: number): ByteRange {
  if (!header) return "none";
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "unsatisfiable";
  if (m[1] === "") {
    // The last n bytes.
    const n = Number(m[2]);
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}
