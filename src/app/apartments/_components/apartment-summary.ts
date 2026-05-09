export interface ApartmentSummary {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  rentChf: number | null;
  distances: {
    locationId: number;
    bikeMin: number | null;
    transitMin: number | null;
  }[];
  shortCode: string | null;
  avgOverall: string | null;
  myRating: number | null;
  createdAt: string | null;
  listingGone: boolean | null;
  latitude: number | null;
  longitude: number | null;
}
