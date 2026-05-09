export interface Rating {
  id: number;
  userName: string;
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
