"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { errorDetailsFromException, type ErrorDetails } from "@/lib/fetch-error";
import { StaleKeyError } from "./household-data-provider";

// errorDetailsFromException, with the store's own user-facing messages in
// the reader's language (#288). Everything else — server-sent text, network
// errors — is shown as it came: it is detail for a bug report, and the
// server's wording is not in the catalogue.
export function useStoreErrorDetails(): (err: unknown) => ErrorDetails {
  const t = useTranslations("apartments.errors");
  return useCallback(
    (err: unknown) => {
      const details = errorDetailsFromException(err);
      if (err instanceof StaleKeyError) details.message = t("staleKey");
      return details;
    },
    [t]
  );
}
