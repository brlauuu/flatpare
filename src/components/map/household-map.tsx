"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toMapPoints } from "@/lib/map/points";
import type { ApartmentView, LocationView } from "@/lib/household-data/types";
import type { MapSource } from "@/lib/map/local-map";

// The map page's body (#330). MapLibre is loaded only here, through
// next/dynamic with ssr: false, so no other page's bundle carries it.
// Everything that decides what is drawn is in src/lib/map and tested
// there; the inner component only draws.

function MapLoading() {
  const t = useTranslations("map.map");
  return <div className="map-grid-bg h-full w-full" aria-label={t("loading")} />;
}

const InnerMap = dynamic(() => import("./household-map-inner"), {
  ssr: false,
  loading: () => <MapLoading />,
});

interface Props {
  apartments: ApartmentView[];
  locations: LocationView[];
  // From `/map?highlight=<id>` (#384): the apartment page's "View on map".
  highlightId?: string | null;
  // Read on the server (#339): OpenFreeMap, or the self-hoster's own file.
  source?: MapSource;
}

const OPENFREEMAP_SOURCE: MapSource = { mode: "openfreemap" };

// FLATPARE_MAPS=local without a usable file in maps/: said plainly, in place
// of a map, to whoever runs the server. The map never falls back to an
// outside service, which is what "local" was chosen for.
function NoLocalMap({ problem }: { problem: "missing" | "several" | "unreadable" }) {
  const t = useTranslations("map.map");
  return (
    <div className="map-grid-bg flex h-full w-full flex-col justify-center gap-2 p-6 text-sm">
      <p className="font-bold">{t("localMissingTitle")}</p>
      <p>{t(`localProblem.${problem}`)}</p>
    </div>
  );
}

function ApartmentLinks({ items }: { items: { id: string; label: string }[] }) {
  const t = useTranslations("map.map");
  return (
    <>
      {items.map((item, i) => (
        <span key={item.id}>
          {i > 0 && t("listSeparator")}
          <Link href={`/apartments/${item.id}`} className="underline">
            {item.label}
          </Link>
        </span>
      ))}
    </>
  );
}

export function HouseholdMap({ apartments, locations, highlightId = null, source = OPENFREEMAP_SOURCE }: Props) {
  const t = useTranslations("map.map");
  const points = useMemo(() => toMapPoints(apartments, locations), [apartments, locations]);
  const [failed, setFailed] = useState(false);
  const readable = points.apartments.length + points.missing.length;
  const nothingPlaced = points.apartments.length === 0 && points.locations.length === 0;

  return (
    <div className="space-y-3">
      {readable === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t.rich("noApartments", {
            upload: (chunks) => (
              <Link href="/apartments/new" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : (
        nothingPlaced && <p className="text-sm text-muted-foreground">{t("nothingPlaced")}</p>
      )}

      <div className="h-[calc(100dvh-13rem)] min-h-[360px] w-full overflow-hidden border-3 border-frame">
        {source.mode === "local" && source.file === null ? (
          <NoLocalMap problem={source.problem} />
        ) : failed ? (
          <div className="map-grid-bg flex h-full w-full flex-col justify-center gap-2 p-6 text-sm">
            <p className="font-bold">{t("failed")}</p>
            {readable > 0 && (
              <p>
                {t.rich("yourApartments", {
                  links: () => <ApartmentLinks items={[...points.apartments, ...points.missing]} />,
                })}
              </p>
            )}
          </div>
        ) : (
          <InnerMap points={points} highlightId={highlightId} source={source} onError={() => setFailed(true)} />
        )}
      </div>

      {points.missing.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t.rich("missing", {
            count: points.missing.length,
            links: () => <ApartmentLinks items={points.missing} />,
          })}
        </p>
      )}
    </div>
  );
}
