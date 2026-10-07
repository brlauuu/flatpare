
// The household's own marks look drawn by hand (#330): a pencil circle
// around each apartment that does not quite close, and a star for a place.
// The wobble is seeded from the row id, so a mark keeps its shape across
// reloads. Coordinates are in a 64×44 box; the mark's centre is (32, 22).

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

export function pencilCirclePath(seed: number): string {
  const points: string[] = [];
  // 14 points over a bit more than a full turn: the end overshoots the start.
  for (let i = 0; i <= 13; i++) {
    const angle = (i / 12) * Math.PI * 2 + jitter(seed, i) * 0.2 - 0.6;
    const rx = 26 + jitter(seed, i + 40) * 4;
    const ry = 16 + jitter(seed, i + 80) * 3;
    const x = 32 + Math.cos(angle) * rx;
    const y = 22 + Math.sin(angle) * ry;
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M ${points.join(" L ")}`;
}

export function starPath(): string {
  return "M 32 8 L 36 18 L 47 18 L 38 25 L 42 36 L 32 29 L 22 36 L 26 25 L 17 18 L 28 18 Z";
}
