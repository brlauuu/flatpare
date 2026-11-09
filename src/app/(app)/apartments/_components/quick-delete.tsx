"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import type { ApartmentView } from "@/lib/household-data/types";

// Delete straight from the list (#437), after the same confirmation the
// apartment page asks, naming the apartment since the list shows several.
// A button beside the link, not inside it: a link may not hold one. The tile
// and the list row (#483) each place it, and its failure message, themselves.
export function QuickDelete({
  apt,
  className,
  alertClassName,
}: {
  apt: ApartmentView;
  className?: string;
  alertClassName?: string;
}) {
  const t = useTranslations("apartments.card");
  const { deleteApartment } = useHouseholdData();
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDelete() {
    if (!confirm(t("deleteConfirm", { name: apt.name }))) return;
    setDeleting(true);
    setFailed(false);
    try {
      await deleteApartment(apt.id);
    } catch {
      setDeleting(false);
      setFailed(true);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        aria-label={t("delete", { name: apt.name })}
        title={t("delete", { name: apt.name })}
        disabled={deleting}
        onClick={() => void handleDelete()}
        // 44px touch target on a phone, as the tile's.
        className={cn("h-11 w-11 shrink-0 p-0 sm:h-8 sm:w-8", className)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
      {failed && (
        <p role="alert" className={cn("rounded-md bg-card text-sm text-destructive", alertClassName)}>
          {t("deleteFailed", { name: apt.name })}
        </p>
      )}
    </>
  );
}
