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
  // The monthly rent, in rentCurrency (the name predates #427).
  rentChf: number | null;
  // ISO 4217 code (#427), null while there is no rent. Envelopes written
  // before it read as CHF when they hold a rent.
  rentCurrency: string | null;
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
  // #413. True once the apartment's first processing (its PDF read, or its
  // address geocoded) has been paid for; an apartment added by hand or from
  // a link starts false and can be rated and described for free. Envelopes
  // written before #413 read as true: their credit was spent when they were
  // created.
  processed: boolean;
  // The address the coordinates and distances belong to; null until an
  // address has been geocoded. When the address no longer matches it the
  // distances are stale, and the views hide them until a reprocess.
  processedAddress: string | null;
  // #430. The user id of the member who added it, kept inside the envelope
  // so the server does not learn who adds what. Null for apartments added
  // before it, and for imported ones (user ids do not carry across).
  addedBy: string | null;
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

// A draft (#190): a listing link saved for later, before it becomes an
// apartment. Only the URL and an optional title; nothing is fetched for it.
// None is made since #413 (a link becomes an unprocessed apartment); the
// store turns the ones left into apartments.
export interface Draft {
  url: string;
  title: string | null;
}

export interface DecodedDraft {
  id: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  data: Draft | null;
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
    rentCurrency: null,
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
    processed: false,
    processedAddress: null,
    addedBy: null,
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
  // The address changed after it was processed (#413). The view then shows
  // no coordinates and no distances, since they belong to the old address.
  addressChanged: boolean;
  corrupt?: true;
}

export interface LocationView extends Location {
  id: string;
  sortOrder: number;
}
