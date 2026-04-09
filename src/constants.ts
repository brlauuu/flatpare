import type { UserId } from "./types";

export const STORAGE_KEYS = {
  apartments: "apts-v1",
  scoresDjordje: "scores-djordje-v1",
  scoresLara: "scores-lara-v1",
  legacyScoresV4: "apt-scores-v4",
  appUnlocked: "app-unlocked-v1"
} as const;

export const USERS: Array<{ id: UserId; label: string; color: string }> = [
  { id: "djordje", label: "Djordje", color: "#534AB7" },
  { id: "lara", label: "Lara", color: "#D4537E" }
];
