export type UserId = "djordje" | "lara";

export type Apartment = {
  name: string;
  addr: string;
  url: string;
  rent: number | string;
  rooms: number | string;
  baths: number | string;
  bal: number | string;
  dist: string;
  wash: "yes" | "no" | "?";
  info: string;
};

export type ScoreValue = 0 | 1 | 2 | 3 | 4 | 5;

export type ScoreRecord = {
  kitchen: ScoreValue;
  balcony: ScoreValue;
  floorplan: ScoreValue;
  light: ScoreValue;
  feel: ScoreValue;
  note: string;
};

export type ScoresByUser = Record<UserId, ScoreRecord[]>;

export type PartialApartment = Partial<Apartment>;
