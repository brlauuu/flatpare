import type { LocationView } from "@/lib/household-data/types";

// The detail page reads ApartmentView / RatingView straight from the store;
// only the location subset the distance section needs is named here.
export type LocationLite = Pick<LocationView, "id" | "label" | "icon" | "address">;
