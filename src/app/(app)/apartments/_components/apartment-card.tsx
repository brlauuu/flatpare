"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { AddedByLine } from "@/components/added-by-line";
import { GoneIcon, NotProcessedIcon, RatingSummary } from "./apartment-badges";
import { ApartmentCorruptCard } from "./apartment-corrupt-card";
import type { ApartmentView } from "@/lib/household-data/types";
import { useFormatRent } from "@/components/use-format-rent";

// Delete straight from the list (#437), after the same confirmation the
// apartment page asks, naming the apartment since the list shows several.
// A button beside the link, not inside it: a link may not hold one.
function QuickDelete({ apt }: { apt: ApartmentView }) {
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
        // In the corner beside the facts: the card's 3px frame and the
        // content's 16px below it and to the right (the card itself has no
        // padding, #451).
        className="absolute right-[19px] bottom-[19px] h-11 w-11 p-0 sm:h-8 sm:w-8"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
      {failed && (
        <p role="alert" className="absolute inset-x-4 top-4 rounded-md bg-card text-sm text-destructive">
          {t("deleteFailed", { name: apt.name })}
        </p>
      )}
    </>
  );
}

const FACT = "h-7 px-1.5 text-sm";

export function ApartmentCard({ apt }: { apt: ApartmentView }) {
  if (apt.corrupt) return <ApartmentCorruptCard apt={apt} />;
  return (
    <div className="relative h-full">
      <CardLink apt={apt} />
      <QuickDelete apt={apt} />
    </div>
  );
}

function CardLink({ apt }: { apt: ApartmentView }) {
  const t = useTranslations("apartments.badges");
  const formatRent = useFormatRent();
  return (
    // Tiles are uniform (#383): the grid gives every tile the same height,
    // the first line (code, rating, status icons) is held open when there is
    // no code, so titles line up, and the facts sit on the bottom edge with
    // the delete button.
    <Link href={`/apartments/${apt.id}`} className="block h-full">
      {/* No padding of its own: the content's 16px is the whole margin (#451). */}
      <Card className="h-full py-0 transition-shadow hover:shadow-md">
        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          {/* The code, then the ratings and the status icons (#451), at the
              right edge on a phone. */}
          <div data-card-top className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span data-card-code className="flex min-h-7 items-center">
              <ShortCode code={apt.shortCode} size="md" />
            </span>
            <span data-card-status className="ml-auto flex items-center gap-1.5 sm:ml-0">
              <RatingSummary avg={apt.avgOverall} mine={apt.myRating} />
              {!apt.processed && <NotProcessedIcon />}
              {apt.listingGone && <GoneIcon />}
            </span>
          </div>
          <h3 className="font-medium leading-tight">{apt.name}</h3>
          {apt.address && (
            <AddressLink
              address={apt.address}
              className="text-sm text-muted-foreground"
            />
          )}
          <AddedByLine addedBy={apt.addedBy} className="text-xs" />
          {/* A step larger than a badge's text (#451), held clear of the
              delete button in the corner and as tall as it, so they line up. */}
          <div data-card-facts className="mt-auto flex min-h-11 flex-wrap items-center gap-1 pr-12 sm:min-h-8 sm:pr-9">
            {apt.rentChf && (
              <Badge variant="secondary" className={FACT}>{formatRent(apt.rentChf, apt.rentCurrency)}</Badge>
            )}
            {apt.sizeM2 && <Badge variant="secondary" className={FACT}>{t("size", { size: apt.sizeM2 })}</Badge>}
            {apt.numRooms && (
              <Badge variant="secondary" className={FACT}>{t("roomsShort", { count: apt.numRooms })}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
