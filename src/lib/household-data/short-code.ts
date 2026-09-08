// 23-letter pool: A–Z minus visually ambiguous letters (I, O, L).
const LETTER_POOL = "ABCDEFGHJKMNPQRSTUVWXYZ";
const MAX_REROLLS = 100;

export interface ShortCodeInput {
  numRooms: number | null;
  numBathrooms: number | null;
  hasWashingMachine: boolean | null;
  postcode: string | null;
}

export function pickLetters(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += LETTER_POOL[Math.floor(random() * LETTER_POOL.length)];
  }
  return out;
}

function formatNumber(v: number | null): string {
  return v == null ? "?" : String(v);
}

function formatWashing(v: boolean | null): string {
  if (v === true) return "Y";
  if (v === false) return "N";
  return "?";
}

export function buildShortCode(
  parts: ShortCodeInput,
  letters: string = pickLetters()
): string {
  return `${letters}-${formatNumber(parts.numRooms)}B-${formatNumber(parts.numBathrooms)}b-W${formatWashing(parts.hasWashingMachine)}-${parts.postcode ?? "?"}`;
}

// Uniqueness used to be a database constraint; the server can no longer see
// codes, so the client re-rolls the letters against the codes it holds.
// After MAX_REROLLS the last candidate is returned — 12 167 letter
// combinations make a persistent collision a bug, not a real state.
export function uniqueShortCode(
  parts: ShortCodeInput,
  taken: Set<string>,
  random: () => number = Math.random
): string {
  let code = buildShortCode(parts, pickLetters(random));
  for (let i = 0; i < MAX_REROLLS && taken.has(code); i++) {
    code = buildShortCode(parts, pickLetters(random));
  }
  return code;
}

// The postcode segment is the last one; "?" means unknown.
export function postcodeFromShortCode(code: string): string | null {
  const parts = code.split("-");
  if (parts.length !== 5) return null;
  const postcode = parts[4];
  return postcode === "?" || postcode === "" ? null : postcode;
}
