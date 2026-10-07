"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toMapPoints } from "@/lib/map/points";
import type { ApartmentView, LocationView } from "@/lib/household-data/types";

// The map page's body (#330). MapLibre is loaded only here, through
// next/dynamic with ssr: false, so no other page's bundle carries it.
// Everything that decides what is drawn is in src/lib/map and tested
// there; the inner component only draws.

const InnerMap = dynamic(() => import("./household-map-inner"), {
  ssr: false,
  loading: () => <div className="map-grid-bg h-full w-full" aria-label="Loading map" />,
});

interface Props {
  apartments: ApartmentView[];
  locations: LocationView[];
}

function ApartmentLinks({ items }: { items: { id: string; label: string }[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={item.id}>
          {i > 0 && ", "}
          <Link href={`/apartments/${item.id}`} className="underline">
            {item.label}
          </Link>
        </span>
      ))}
    </>
  );
}

export function HouseholdMap({ apartments, locations }: Props) {
  const points = useMemo(() => toMapPoints(apartments, locations), [apartments, locations]);
  const [failed, setFailed] = useState(false);
  const readable = points.apartments.length + points.missing.length;
  const nothingPlaced = points.apartments.length === 0 && points.locations.length === 0;

  return (
    <div className="space-y-3">
      {readable === 0 ? (
        <p className="text-sm text-muted-foreground">
          No apartments yet.{" "}
          <Link href="/apartments/new" className="underline">
            Upload a listing
          </Link>{" "}
          and it appears here once it has an address.
        </p>
      ) : (
        nothingPlaced && <p className="text-sm text-muted-foreground">Nothing to show yet — add an apartment with an address.</p>
      )}

      <div className="h-[calc(100dvh-13rem)] min-h-[360px] w-full overflow-hidden border-3 border-frame">
        {failed ? (
          <div className="map-grid-bg flex h-full w-full flex-col justify-center gap-2 p-6 text-sm">
            <p className="font-bold">The map couldn&apos;t load.</p>
            {readable > 0 && (
              <p>
                Your apartments: <ApartmentLinks items={[...points.apartments, ...points.missing]} />
              </p>
            )}
          </div>
        ) : (
          <InnerMap points={points} onError={() => setFailed(true)} />
        )}
      </div>

      {points.missing.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {points.missing.length === 1 ? "1 apartment isn't" : `${points.missing.length} apartments aren't`} on the map yet:{" "}
          <ApartmentLinks items={points.missing} />
        </p>
      )}
    </div>
  );
}
