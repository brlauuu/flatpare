// Plaintext shapes of the three encrypted tables. Everything the server used
// to hold as columns lives inside the envelope now, including the short code
// and the per-location distances. These types are the contract between the
// codec (which validates them on open) and every page (which reads views).

export interface ApartmentDistance {
  bikeMin: number | null;
  transitMin: number | null;
}

export interface ApartmentPdf {
  // Stored-file URL as returned by uploadEncryptedFile: /api/pdf/... or
  // /api/uploads/... . Server-validated to belong to the household.
  path: string;
  // AES-GCM iv (base64) of the encrypted bytes; null when stored in the clear.
  iv: string | null;
}

export interface Apartment {
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  listingUrl: string | null;
  summary: string | null;
  availableFrom: string | null;
  shortCode: string | null;
  rawExtractedData: unknown | null;
  userEditedFields: string[];
  latitude: number | null;
  longitude: number | null;
  listingGone: boolean;
  listingCheckedAt: string | null;
  // Keyed by location id.
  distances: Record<string, ApartmentDistance>;
  pdf: ApartmentPdf | null;
}

export interface Rating {
  kitchen: number;
  balconies: number;
  location: number;
  floorplan: number;
  overallFeeling: number;
  comment: string;
}

export interface Location {
  label: string;
  icon: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export function emptyApartment(name = ""): Apartment {
  return {
    name,
    address: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    hasWashingMachine: null,
    rentChf: null,
    listingUrl: null,
    summary: null,
    availableFrom: null,
    shortCode: null,
    rawExtractedData: null,
    userEditedFields: [],
    latitude: null,
    longitude: null,
    listingGone: false,
    listingCheckedAt: null,
    distances: {},
    pdf: null,
  };
}

export const EMPTY_RATING: Rating = {
  kitchen: 0,
  balconies: 0,
  location: 0,
  floorplan: 0,
  overallFeeling: 0,
  comment: "",
};

// A row after decoding. `data: null` means the envelope could not be opened
// or failed its schema — the view layer shows a placeholder for it.
export interface DecodedApartment {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  data: Apartment | null;
}

export interface DecodedRating {
  apartmentId: string;
  userId: string;
  userName: string;
  updatedAt: string;
  data: Rating | null;
}

export interface DecodedLocation {
  id: string;
  sortOrder: number;
  data: Location | null;
}

// Views are what pages render: plaintext plus row metadata plus derived
// values, all computed in the browser (src/lib/household-data/derive.ts).
export interface RatingView extends Rating {
  userId: string;
  userName: string;
  updatedAt: string;
}

export interface ApartmentView extends Apartment {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  ratings: RatingView[];
  avgKitchen: number | null;
  avgBalconies: number | null;
  avgLocation: number | null;
  avgFloorplan: number | null;
  avgOverall: number | null;
  // The caller's own overallFeeling, or null when they have not rated.
  myRating: number | null;
  corrupt?: true;
}

export interface LocationView extends Location {
  id: string;
  sortOrder: number;
}
