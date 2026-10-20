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
    <Link href={`/apartments/${apt.id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <ShortCode code={apt.shortCode} size="md" />
            <div className="flex items-center gap-1.5">
              {apt.listingGone && <GoneBadge />}
              <RatedBadge myRating={apt.myRating} />
            </div>
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
          <div className="flex flex-wrap gap-2">
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
