import type { Envelope } from "@/lib/crypto";

// What the data routes send and accept. Timestamps are ISO strings.
export interface ApartmentRow {
  id: string;
  version: number;
  envelope: Envelope;
  createdAt: string;
  updatedAt: string;
}

export interface RatingRow {
  apartmentId: string;
  userId: string;
  userName: string;
  envelope: Envelope;
  updatedAt: string;
}

export interface DraftRow {
  id: string;
  createdBy: string | null;
  createdByName: string | null;
  envelope: Envelope;
  createdAt: string;
}

export interface LocationRow {
  id: string;
  sortOrder: number;
  envelope: Envelope;
  createdAt: string;
  updatedAt: string;
}
