import { STORAGE_KEYS } from "../constants";
import type { Apartment, ScoreRecord, ScoresByUser } from "../types";

type LegacyRecord = Partial<{
  kitchen: number;
  balcony: number;
  floorplan: number;
  light: number;
  feel: number;
  usernote: string;
}>;

export function emptyScoreRecord(): ScoreRecord {
  return {
    kitchen: 0,
    balcony: 0,
    floorplan: 0,
    light: 0,
    feel: 0,
    note: ""
  };
}

function toScore(value: unknown): ScoreRecord[keyof Omit<ScoreRecord, "note">] {
  if (typeof value !== "number" || value < 0 || value > 5) {
    return 0;
  }

  return Math.round(value) as 0 | 1 | 2 | 3 | 4 | 5;
}

export function migrateLegacyScores(legacy: LegacyRecord[]): ScoreRecord[] {
  return legacy.map((record) => ({
    kitchen: toScore(record.kitchen),
    balcony: toScore(record.balcony),
    floorplan: toScore(record.floorplan),
    light: toScore(record.light),
    feel: toScore(record.feel),
    note: typeof record.usernote === "string" ? record.usernote : ""
  }));
}

export function normalizeScoresByApartmentCount(
  apartments: Apartment[],
  scoresByUser: ScoresByUser
): ScoresByUser {
  const targetLength = apartments.length;

  const padOrTrim = (entries: ScoreRecord[]): ScoreRecord[] => {
    if (entries.length === targetLength) {
      return entries;
    }

    if (entries.length > targetLength) {
      return entries.slice(0, targetLength);
    }

    return [
      ...entries,
      ...Array.from({ length: targetLength - entries.length }, emptyScoreRecord)
    ];
  };

  return {
    djordje: padOrTrim(scoresByUser.djordje),
    lara: padOrTrim(scoresByUser.lara)
  };
}

export function createApartmentFromInput(input: Partial<Apartment>): Apartment {
  const addr = (input.addr ?? "").trim();
  const generatedName = addr.split(/\s+/).slice(0, 2).join(" ") || "Untitled";

  return {
    name: input.name?.trim() || generatedName,
    addr,
    url: input.url?.trim() || "",
    rent: input.rent ?? "?",
    rooms: input.rooms ?? "?",
    baths: input.baths ?? "?",
    bal: input.bal ?? "?",
    dist: input.dist?.trim() || "?",
    wash: input.wash ?? "?",
    info: input.info?.trim() || ""
  };
}

export function appendApartmentAndEmptyScores(
  apartments: Apartment[],
  scoresByUser: ScoresByUser,
  apartment: Apartment
): { apartments: Apartment[]; scoresByUser: ScoresByUser; newIndex: number } {
  const nextApartments = [...apartments, apartment];
  const nextScores: ScoresByUser = {
    djordje: [...scoresByUser.djordje, emptyScoreRecord()],
    lara: [...scoresByUser.lara, emptyScoreRecord()]
  };

  return {
    apartments: nextApartments,
    scoresByUser: nextScores,
    newIndex: nextApartments.length - 1
  };
}

export function loadLegacyScoresFromLocalStorage(): LegacyRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.legacyScoresV4);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as LegacyRecord[];
  } catch {
    return [];
  }
}
