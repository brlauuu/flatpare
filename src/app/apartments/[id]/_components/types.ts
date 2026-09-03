export interface Rating {
  id: number;
  userId: string;
  // Resolved via a left join against `users`; null when the account has no
  // display name set (some OAuth providers don't supply one) — identity
  // must be keyed on `userId`, never on this.
  userName: string | null;
  kitchen: number;
  balconies: number;
  location: number;
  floorplan: number;
  overallFeeling: number;
  comment: string;
}

export interface ApartmentDetail {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  pdfUrl: string | null;
  listingUrl: string | null;
  summary: string | null;
  availableFrom: string | null;
  userEditedFields: string | null;
  shortCode: string | null;
  mapEmbedUrl: string | null;
  ratings: Rating[];
  distances: {
    locationId: number;
    bikeMin: number | null;
    transitMin: number | null;
  }[];
}

export interface LocationLite {
  id: number;
  label: string;
  icon: string;
  address: string;
}
