import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { ShortCode } from "@/components/short-code";
import { GoneBadge, RatedBadge } from "./apartment-badges";
import type { ApartmentSummary } from "./apartment-summary";

export function ApartmentRow({ apt }: { apt: ApartmentSummary }) {
  return (
    <Link
      href={`/apartments/${apt.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ShortCode code={apt.shortCode} size="sm" />
          <h3 className="truncate font-medium leading-tight">{apt.name}</h3>
        </div>
        {apt.address && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {apt.address}
          </p>
        )}
      </div>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {apt.rentChf && (
          <Badge variant="secondary">CHF {apt.rentChf.toLocaleString()}</Badge>
        )}
        {apt.numRooms && <Badge variant="secondary">{apt.numRooms} rm</Badge>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {apt.listingGone && <GoneBadge />}
        <RatedBadge myRating={apt.myRating} />
      </div>
      {apt.avgOverall && (
        <StarRating
          value={Math.round(parseFloat(apt.avgOverall))}
          readonly
          size="sm"
        />
      )}
    </Link>
  );
}
