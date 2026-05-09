export interface ApartmentWithRatings {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  distances: {
    locationId: number;
    bikeMin: number | null;
    transitMin: number | null;
  }[];
  pdfUrl: string | null;
  listingUrl: string | null;
  shortCode: string | null;
  createdAt: string | null;
  avgOverall: string | null;
  ratings: {
    userName: string;
    kitchen: number;
    balconies: number;
    location: number;
    floorplan: number;
    overallFeeling: number;
    comment: string;
  }[];
}

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
