export const metricRows = [
  {
    key: "rentChf",
    label: "Rent (CHF)",
    format: (v: number) => `${v.toLocaleString()}`,
    best: "min",
  },
  {
    key: "sizeM2",
    label: "Size (m²)",
    format: (v: number) => `${v}`,
    best: "max",
  },
  {
    key: "numRooms",
    label: "Rooms",
    format: (v: number) => `${v}`,
    best: "max",
  },
  {
    key: "numBathrooms",
    label: "Bathrooms",
    format: (v: number) => `${v}`,
    best: "max",
  },
  {
    key: "numBalconies",
    label: "Balconies",
    format: (v: number) => `${v}`,
    best: "max",
  },
] as const;

export const ratingKeys = [
  "kitchen",
  "balconies",
  "location",
  "floorplan",
  "overallFeeling",
] as const;

export const ratingLabels: Record<string, string> = {
  kitchen: "Kitchen",
  balconies: "Balconies",
  location: "Location",
  floorplan: "Floorplan",
  overallFeeling: "Overall",
};
