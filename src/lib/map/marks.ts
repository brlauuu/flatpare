
// The household's own marks look drawn by hand (#330): each apartment is a
// dot scribbled in with a pen (#479); a place is drawn with its own icon, in
// src/components/map/map-mark.tsx. The scribble is seeded from the row id,
// so a mark keeps its shape across reloads. Coordinates are in a 64×44 box;
// the mark's centre is (32, 22).

export const MARK_WIDTH = 64;
export const MARK_HEIGHT = 44;

export function seedFromId(id: string): number {
  // FNV-1a, 32-bit. Stable, cheap, and good enough to vary a wobble.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function jitter(seed: number, n: number): number {
  const x = Math.sin(seed * 0.0001 + n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// A dot coloured in with a pen: a spiral from the rim to the middle, its
// radius wobbling, so the strokes overlap into a dot with a few gaps left.
// The start angle and the wobble come from the seed.
export function scribbleDotPath(seed: number): string {
  const steps = 30;
  const turns = 2.6;
  const start = jitter(seed, 0) * Math.PI * 2;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = start + t * turns * Math.PI * 2;
    const r = (7.5 - t * 6) * (0.88 + jitter(seed, i + 1) * 0.24);
    const x = 32 + Math.cos(angle) * r * 1.1;
    const y = 22 + Math.sin(angle) * r * 0.92;
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M ${points.join(" L ")}`;
}
