import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { GoneBadge, RatedBadge } from "./apartment-badges";
import type { ApartmentSummary } from "./apartment-summary";

export function ApartmentCard({ apt }: { apt: ApartmentSummary }) {
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
            {apt.avgOverall && (
              <StarRating
                value={Math.round(parseFloat(apt.avgOverall))}
                readonly
                size="sm"
              />
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
              <Badge variant="secondary">
                CHF {apt.rentChf.toLocaleString()}
              </Badge>
            )}
            {apt.sizeM2 && <Badge variant="secondary">{apt.sizeM2} m²</Badge>}
            {apt.numRooms && (
              <Badge variant="secondary">{apt.numRooms} rooms</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
