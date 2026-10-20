"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { SortText } from "@/lib/apartment-sort";

// The sort dropdowns' words (#288), shared by the apartments list and the
// compare page. src/lib/apartment-sort.ts builds the options; this gives it
// the active language's labels.
export function useSortText(): SortText {
  const t = useTranslations("common.sort");
  return useMemo(
    () => ({
      field: (id) => t(id),
      bikeTo: (place) => t("bikeTo", { place }),
      transitTo: (place) => t("transitTo", { place }),
    }),
    [t]
  );
}
