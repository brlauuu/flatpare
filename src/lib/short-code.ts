import { extractPostcode } from "@/lib/geocode";

// 23-letter pool: A–Z minus visually ambiguous letters (I, O, L).
const LETTER_POOL = "ABCDEFGHJKMNPQRSTUVWXYZ";

export function pickLetters(): string {
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)];
  }
  return out;
}

export interface ShortCodeInput {
  numRooms: number | null;
  numBathrooms: number | null;
  hasWashingMachine: boolean | null;
  address: string | null;
}

export interface ShortCodeParts {
  rooms: string;
  baths: string;
  wash: string;
  postcode: string;
}

function formatInt(v: number | null): string {
  return v == null ? "?" : String(v);
}

function formatWashing(v: boolean | null): string {
  if (v === true) return "Y";
  if (v === false) return "N";
  return "?";
}

export async function computeShortCodeParts(
  input: ShortCodeInput
): Promise<ShortCodeParts> {
  const postcode = input.address ? await extractPostcode(input.address) : null;
  return {
    rooms: formatInt(input.numRooms),
    baths: formatInt(input.numBathrooms),
    wash: formatWashing(input.hasWashingMachine),
    postcode: postcode ?? "?",
  };
}

export function buildShortCode(
  parts: ShortCodeParts,
  letters: string = pickLetters()
): string {
  return `${letters}-${parts.rooms}B-${parts.baths}b-W${parts.wash}-${parts.postcode}`;
}

export async function generateShortCode(
  input: ShortCodeInput,
  letters: string = pickLetters()
): Promise<string> {
  const parts = await computeShortCodeParts(input);
  return buildShortCode(parts, letters);
}
