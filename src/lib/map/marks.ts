
// The household's own marks look drawn by hand (#330). Each apartment gets
// one of a few small pen marks (#479): a scribbled dot, an x, a hatched
// square or a triangle. A place is drawn with its own icon, in
// src/components/map/map-mark.tsx. Which mark, and its wobble, are seeded
// from the row id, so an apartment keeps its mark across reloads.
// Coordinates are in a 64×44 box; the mark's centre is (32, 22), and every
// mark stays within about 9 of it.

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

const CX = 32;
const CY = 22;

function pt(x: number, y: number): string {
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

// A wobble of up to ±amount, seeded.
function wob(seed: number, n: number, amount: number): number {
  return (jitter(seed, n) - 0.5) * 2 * amount;
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
    points.push(pt(CX + Math.cos(angle) * r * 1.1, CY + Math.sin(angle) * r * 0.92));
  }
  return `M ${points.join(" L ")}`;
}

// A small x: two strokes, each bowing a little in the middle as a quick pen
// stroke does, the second not quite through the first's centre.
export function scribbleCrossPath(seed: number): string {
  const r = 6.5;
  const stroke = (from: [number, number], to: [number, number], n: number) => {
    const mx = (from[0] + to[0]) / 2 + wob(seed, n, 1.2);
    const my = (from[1] + to[1]) / 2 + wob(seed, n + 1, 1.2);
    return `M ${pt(from[0], from[1])} Q ${pt(mx, my)} ${pt(to[0], to[1])}`;
  };
  const a = stroke([CX - r + wob(seed, 1, 1), CY - r + wob(seed, 2, 1)], [CX + r + wob(seed, 3, 1), CY + r + wob(seed, 4, 1)], 5);
  const b = stroke([CX + r + wob(seed, 7, 1), CY - r + wob(seed, 8, 1)], [CX - r + wob(seed, 9, 1), CY + r + wob(seed, 10, 1)], 11);
  return `${a} ${b}`;
}

// A small square filled with a zigzag, back and forth, top to bottom.
export function scribbleHatchPath(seed: number): string {
  const half = 6;
  const rows = 6;
  const points: string[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = CY - half + (i / rows) * half * 2 + wob(seed, i + 20, 0.6);
    const x = i % 2 === 0 ? CX - half + wob(seed, i + 40, 1) : CX + half + wob(seed, i + 40, 1);
    points.push(pt(x, y));
  }
  return `M ${points.join(" L ")}`;
}

// A small triangle in one stroke, overshooting where it closes.
export function scribbleTrianglePath(seed: number): string {
  const corners: [number, number][] = [
    [CX, CY - 7.5],
    [CX + 7.5, CY + 6],
    [CX - 7.5, CY + 6],
  ];
  const points = corners.map(([x, y], i) => pt(x + wob(seed, i * 2 + 60, 1), y + wob(seed, i * 2 + 61, 1)));
  // Back past the first corner, the way a pen ends a quick triangle.
  points.push(pt(CX + 1.5 + wob(seed, 70, 0.8), CY - 5 + wob(seed, 71, 0.8)));
  return `M ${points.join(" L ")}`;
}

export const APARTMENT_MARKS = ["dot", "cross", "hatch", "triangle"] as const;
export type ApartmentMarkShape = (typeof APARTMENT_MARKS)[number];

export function apartmentMarkShape(seed: number): ApartmentMarkShape {
  return APARTMENT_MARKS[seed % APARTMENT_MARKS.length];
}

const DRAW: Record<ApartmentMarkShape, (seed: number) => string> = {
  dot: scribbleDotPath,
  cross: scribbleCrossPath,
  hatch: scribbleHatchPath,
  triangle: scribbleTrianglePath,
};

export function apartmentMarkPath(seed: number): string {
  return DRAW[apartmentMarkShape(seed)](seed);
}
