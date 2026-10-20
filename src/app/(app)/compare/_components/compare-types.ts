// Row labels live in the compare catalogue (messages/<locale>/compare.json,
// `table.metric.<key>`); the table formats every value with the active
// locale's number format (#288).
export const metricRows = [
  { key: "rentChf", best: "min" },
  { key: "sizeM2", best: "max" },
  { key: "numRooms", best: "max" },
  { key: "numBathrooms", best: "max" },
  { key: "numBalconies", best: "max" },
] as const;

export const ratingKeys = [
  "kitchen",
  "balconies",
  "location",
  "floorplan",
  "overallFeeling",
] as const;
