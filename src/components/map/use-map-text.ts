"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { MapText } from "@/lib/map/points";
import { useFormatRent } from "@/components/use-format-rent";

// The map's words and number formats in the active language (#288), for the
// pure modules in src/lib/map that build marks and cards.
export function useMapText(): MapText {
  const t = useTranslations("map");
  const format = useFormatter();
  const formatRent = useFormatRent();
  return useMemo(
    () => ({
      rent: formatRent,
      size: (m2: number) => t("card.size", { value: format.number(m2) }),
      rooms: (n: number) => t("card.rooms", { count: n }),
      opensApartment: t("mark.opensApartment"),
    }),
    [t, format, formatRent]
  );
}
