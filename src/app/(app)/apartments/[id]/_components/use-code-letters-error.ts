import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { lettersOf, lettersProblem } from "@/lib/household-data/short-code";
import type { ApartmentView } from "@/lib/household-data/types";

// The edit form's message for the code letters, or null when they can be
// saved. Checked against the apartments the household holds now, so a
// deleted apartment's letters are free again (#410).
export function useCodeLettersError(
  apartments: ApartmentView[],
  apartment: ApartmentView | null,
  letters: string
): string | null {
  const t = useTranslations("apartments.edit");
  const takenBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of apartments) {
      const own = a.id === apartment?.id ? null : lettersOf(a.shortCode);
      if (own) map.set(own, a.name);
    }
    return map;
  }, [apartments, apartment?.id]);
  if (!apartment) return null;
  const problem = lettersProblem(letters, lettersOf(apartment.shortCode), takenBy);
  if (problem === null) return null;
  return problem.kind === "invalid"
    ? t("codeInvalid")
    : t("codeTaken", { letters, name: problem.by });
}
