"use client";

import { useCallback } from "react";
import { useFormatter } from "next-intl";
import { rentCurrencyOf, rentFormatOptions } from "@/lib/household-data/rent";

// A rent written in its own currency and the active language's number
// format (#427): "CHF 2'650" or "EUR 1'200" in German, "€1,200" in English. A rent saved
// before #427 has no currency and was in francs.
export function useFormatRent(): (amount: number, currency: string | null) => string {
  const format = useFormatter();
  return useCallback(
    (amount, currency) => {
      const code = rentCurrencyOf({ rentCurrency: currency });
      return format.number(amount, rentFormatOptions(amount, code));
    },
    [format]
  );
}
