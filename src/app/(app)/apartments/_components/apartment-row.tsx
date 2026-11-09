import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { ShortCode } from "@/components/short-code";
import { GoneBadge, NotProcessedBadge, RatingSummary } from "./apartment-badges";
import { ApartmentCorruptRow } from "./apartment-corrupt-card";
import { QuickDelete } from "./quick-delete";
import type { ApartmentView } from "@/lib/household-data/types";
import { useFormatRent } from "@/components/use-format-rent";

export function ApartmentRow({ apt }: { apt: ApartmentView }) {
  if (apt.corrupt) return <ApartmentCorruptRow apt={apt} />;
  return (
    // The ratings and the delete button as on the tile (#483). The button
    // sits beside the link, not inside it, and the hover covers both.
    <div className="relative flex items-center transition-colors hover:bg-accent/50">
      <RowLink apt={apt} />
      <QuickDelete
        apt={apt}
        className="mr-4"
        alertClassName="absolute inset-x-4 top-1/2 -translate-y-1/2 px-1 py-0.5"
      />
    </div>
  );
}

function RowLink({ apt }: { apt: ApartmentView }) {
  const t = useTranslations("apartments.badges");
  const formatRent = useFormatRent();
  return (
    <Link
      href={`/apartments/${apt.id}`}
      className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 pl-4"
    >
      <div className="min-w-0 flex-1">
        {/* On a phone the code and the name take a line each, or the code
            and the ratings leave the name no room at all (#483). */}
        <div data-row-title className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
          <ShortCode code={apt.shortCode} size="sm" />
          <h3 className="w-full min-w-0 truncate font-medium leading-tight sm:w-auto">{apt.name}</h3>
        </div>
        {apt.address && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {apt.address}
          </p>
        )}
      </div>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {apt.rentChf && (
          <Badge variant="secondary">{formatRent(apt.rentChf, apt.rentCurrency)}</Badge>
        )}
        {apt.numRooms && <Badge variant="secondary">{t("roomsShort", { count: apt.numRooms })}</Badge>}
      </div>
      <div data-row-status className="flex shrink-0 items-center gap-1.5">
        {apt.listingGone && <GoneBadge />}
        {!apt.processed && <NotProcessedBadge />}
        <RatingSummary avg={apt.avgOverall} mine={apt.myRating} />
      </div>
    </Link>
  );
}
