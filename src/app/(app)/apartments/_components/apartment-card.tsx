import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { GoneBadge, RatedBadge } from "./apartment-badges";
import { ApartmentCorruptCard } from "./apartment-corrupt-card";
import type { ApartmentView } from "@/lib/household-data/types";

export function ApartmentCard({ apt }: { apt: ApartmentView }) {
  const t = useTranslations("apartments.badges");
  if (apt.corrupt) return <ApartmentCorruptCard apt={apt} />;
  return (
    // Tiles are uniform (#383): the grid gives every tile the same height,
    // the badges and the short code each keep their own line (held open
    // when there is no code, so titles line up), and the facts sit on the
    // bottom edge.
    <Link href={`/apartments/${apt.id}`} className="block h-full">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <div data-card-badges className="flex flex-wrap items-center gap-1.5">
            {apt.listingGone && <GoneBadge />}
            <RatedBadge myRating={apt.myRating} />
          </div>
          <div data-card-code className="flex min-h-7 items-center">
            <ShortCode code={apt.shortCode} size="md" />
          </div>
          <div className="flex items-start justify-between">
            <h3 className="font-medium leading-tight">{apt.name}</h3>
            {apt.avgOverall !== null && (
              <StarRating value={Math.round(apt.avgOverall)} readonly size="sm" />
            )}
          </div>
          {apt.address && (
            <AddressLink
              address={apt.address}
              className="text-sm text-muted-foreground"
            />
          )}
          <div data-card-facts className="mt-auto flex flex-wrap gap-2">
            {apt.rentChf && (
              <Badge variant="secondary">{t("rent", { amount: apt.rentChf })}</Badge>
            )}
            {apt.sizeM2 && <Badge variant="secondary">{t("size", { size: apt.sizeM2 })}</Badge>}
            {apt.numRooms && (
              <Badge variant="secondary">{t("rooms", { count: apt.numRooms })}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
