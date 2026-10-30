"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAddedBy } from "@/components/use-added-by";

// "Added by <name>" (#430), on the tile and the apartment page. Nothing when
// nobody knows who added it.
export function AddedByLine({ addedBy, className }: { addedBy: string | null; className?: string }) {
  const t = useTranslations("apartments.addedBy");
  const who = useAddedBy(addedBy);
  if (who === null) return null;
  return (
    <p data-added-by className={cn("text-muted-foreground", className)}>
      {who.kind === "you" ? t("you") : who.kind === "former" ? t("former") : t("member", { name: who.name })}
    </p>
  );
}
