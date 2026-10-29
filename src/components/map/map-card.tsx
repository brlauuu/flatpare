import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ApartmentPoint, LocationPoint } from "@/lib/map/points";
import { useMapText } from "./use-map-text";

// The card a mark opens on the map (#330). Framed like every other card.
// The apartment card is one link: on a phone, tapping it is how the
// apartment opens (the first tap on the mark only shows the card).

// Estimates used to decide whether the card fits above its mark. The card
// wraps on a phone (facts line, long code), so this errs tall; a taller
// card than this still never covers its mark (see view.ts).
export const APARTMENT_CARD_HEIGHT = 200;
export const LOCATION_CARD_HEIGHT = 72;

const frame = "block w-52 rounded-xl border-3 border-frame bg-card p-3 text-card-foreground shadow-frame";

export function ApartmentCard({ apartment: a }: { apartment: ApartmentPoint }) {
  const t = useTranslations("map.card");
  const format = useFormatter();
  const text = useMapText();
  const facts = [
    a.rentChf !== null ? text.rent(a.rentChf, a.rentCurrency) : null,
    a.sizeM2 !== null ? text.size(a.sizeM2) : null,
    a.numRooms !== null ? text.rooms(a.numRooms) : null,
  ].filter((f): f is string => f !== null);
  return (
    <Link href={`/apartments/${a.id}`} className={frame}>
      <span className="block text-xl font-extrabold tracking-tight">{a.label}</span>
      {facts.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-x-3 font-mono text-sm">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </span>
      )}
      <span className="mt-1 block font-mono text-sm">
        {a.avgOverall === null
          ? t("notRated")
          : t("rating", { value: format.number(a.avgOverall, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
      </span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{a.name}</span>
      <span className="mt-2 block font-mono text-xs font-semibold underline">{t("open")}</span>
    </Link>
  );
}

export function LocationCard({ location: l }: { location: LocationPoint }) {
  return (
    <div className={frame}>
      <span className="block font-bold">{l.label}</span>
      {l.address && <span className="mt-1 block truncate text-xs text-muted-foreground">{l.address}</span>}
    </div>
  );
}
