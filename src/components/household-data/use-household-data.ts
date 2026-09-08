"use client";

import { useContext } from "react";
import { HouseholdDataContext, type HouseholdDataContextValue } from "./household-data-provider";

export function useHouseholdData(): HouseholdDataContextValue {
  const ctx = useContext(HouseholdDataContext);
  if (!ctx) throw new Error("useHouseholdData must be used inside HouseholdDataProvider");
  return ctx;
}
