import type { Apartment } from "./types";

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

// The letters are an apartment's name in conversation ("did you see KXR?"),
// so they are unique on their own within a household, not just the whole
// code (#410). The server cannot see codes; the client re-rolls against the
// letters it holds. After MAX_REROLLS the last candidate is returned —
// 12 167 combinations make a persistent collision a bug, not a real state.
export function freshLetters(
  taken: Set<string>,
  random: () => number = Math.random
): string {
  let letters = pickLetters(random);
  for (let i = 0; i < MAX_REROLLS && taken.has(letters); i++) {
    letters = pickLetters(random);
  }
  return letters;
}

// A person may choose any three letters, I, O and L included; only the
// random pick avoids them.
export function isValidLetters(letters: string): boolean {
  return /^[A-Z]{3}$/.test(letters);
}

export function lettersOf(code: string | null): string | null {
  const letters = code?.split("-")[0] ?? "";
  return isValidLetters(letters) ? letters : null;
}

function codeFor(a: Apartment, postcode: string | null, letters: string): string {
  return buildShortCode(
    {
      numRooms: a.numRooms,
      numBathrooms: a.numBathrooms,
      hasWashingMachine: a.hasWashingMachine,
      postcode,
    },
    letters
  );
}

// Brings the code in line with the apartment on every save, keeping its
// letters: only rooms, bathrooms, washing machine and postcode follow the
// data. A changed address voids the postcode until it is geocoded again.
// Pure, so the code never waits on a network call (#410).
export function syncShortCode(
  previous: Apartment | null,
  next: Apartment,
  taken: Set<string>,
  random: () => number = Math.random
): Apartment {
  const letters = lettersOf(next.shortCode) ?? freshLetters(taken, random);
  const addressChanged = previous !== null && previous.address !== next.address;
  const postcode = addressChanged ? null : postcodeFromShortCode(next.shortCode ?? "");
  return { ...next, shortCode: codeFor(next, postcode, letters) };
}

export function withLetters(a: Apartment, letters: string): Apartment {
  return { ...a, shortCode: codeFor(a, postcodeFromShortCode(a.shortCode ?? ""), letters) };
}

export function withPostcode(
  a: Apartment,
  postcode: string | null,
  taken: Set<string>,
  random: () => number = Math.random
): Apartment {
  const letters = lettersOf(a.shortCode) ?? freshLetters(taken, random);
  return { ...a, shortCode: codeFor(a, postcode, letters) };
}

// The postcode segment is the last one; "?" means unknown.
export function postcodeFromShortCode(code: string): string | null {
  const parts = code.split("-");
  if (parts.length !== 5) return null;
  const postcode = parts[4];
  return postcode === "?" || postcode === "" ? null : postcode;
}

export type LettersProblem = { kind: "invalid" } | { kind: "taken"; by: string } | null;

// What is wrong with letters typed into the edit form. `takenBy` maps the
// letters of every other apartment the household holds to its name, so a
// deleted apartment's letters are free again. Empty is fine only for an
// apartment that has no letters yet: the save then picks them.
export function lettersProblem(
  letters: string,
  own: string | null,
  takenBy: Map<string, string>
): LettersProblem {
  if (letters === "" && own === null) return null;
  if (!isValidLetters(letters)) return { kind: "invalid" };
  const by = takenBy.get(letters);
  return by === undefined ? null : { kind: "taken", by };
}
