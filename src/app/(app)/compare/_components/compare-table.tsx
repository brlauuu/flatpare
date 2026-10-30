import { Fragment } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/star-rating";
import { iconComponentFor } from "@/lib/location-icons";
import type { ApartmentView, LocationView } from "@/lib/household-data/types";
import { CompareColumnHeader } from "./compare-column-header";
import { metricRows, ratingKeys } from "./compare-types";
import { useFormatRent } from "@/components/use-format-rent";
import { rentCurrencyOf } from "@/lib/household-data/rent";
import { useAddedBy } from "@/components/use-added-by";

interface CompareTableProps {
  visible: ApartmentView[];
  sortedVisible: ApartmentView[];
  locations: LocationView[];
  onHide: (id: string) => void;
  onViewPdf: (apt: ApartmentView) => void;
}

export function CompareTable({ visible, sortedVisible, locations, onHide, onViewPdf }: CompareTableProps) {
  const t = useTranslations("compare.table");
  const tCommon = useTranslations("common.ratingCategory");
  const format = useFormatter();
  const formatRent = useFormatRent();
  // The table's rating rows: the shared category names, except the overall
  // one, which is shortened to fit the label column.
  const ratingLabel = (key: (typeof ratingKeys)[number]) =>
    key === "overallFeeling" ? t("overall") : tCommon(key);
  // Group by userId — the stable, unique identity — and resolve a display
  // label separately. userName is the rater's chosen name, or their email
  // until they set one (displayName, #327) — not unique across accounts, so
  // it can never be the grouping key (two members sharing a first name
  // would silently collapse into one row).
  const userLabels = new Map<string, string>();
  for (const a of visible) {
    for (const r of a.ratings) {
      if (!userLabels.has(r.userId)) userLabels.set(r.userId, r.userName);
    }
  }
  const allUserIds = [...userLabels.keys()];

  // The best value among the apartments `group` puts together: all of them,
  // except for rent, which is compared within each currency (#427).
  function findBest(key: string, direction: string, group: (a: ApartmentView) => string) {
    const values = new Map<string, number[]>();
    for (const a of visible) {
      const v = (a as unknown as Record<string, unknown>)[key] as number | null;
      if (v == null) continue;
      const g = group(a);
      values.set(g, [...(values.get(g) ?? []), v]);
    }
    const best = new Map<string, number>();
    for (const [g, vs] of values) best.set(g, direction === "min" ? Math.min(...vs) : Math.max(...vs));
    return best;
  }

  return (
    <div className="overflow-x-auto border-3 border-frame bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-3 border-frame bg-card">
            <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium">
              &nbsp;
            </th>
            {sortedVisible.map((apt) => (
              <CompareColumnHeader key={apt.id} apt={apt} onHide={onHide} onViewPdf={onViewPdf} />
            ))}
          </tr>
        </thead>
        <tbody>
          {metricRows.map((metric) => {
            const group = metric.key === "rentChf" ? rentCurrencyOf : () => "";
            const bestVal = findBest(metric.key, metric.best, group);
            return (
              <tr key={metric.key} className="border-b">
                <td className="sticky left-0 z-10 bg-card px-4 py-2 font-medium">
                  {t(`metric.${metric.key}`)}
                </td>
                {sortedVisible.map((apt) => {
                  const val = (apt as unknown as Record<string, unknown>)[
                    metric.key
                  ] as number | null;
                  const isBest = val != null && val === bestVal.get(group(apt));
                  return (
                    <td
                      key={apt.id}
                      data-best={isBest ? "true" : undefined}
                      className={cn(
                        "px-4 py-2 font-mono",
                        isBest && "bg-secondary font-semibold dark:bg-primary dark:text-primary-foreground print:bg-transparent print:text-black print:underline"
                      )}
                    >
                      {val == null
                        ? "—"
                        : metric.key === "rentChf"
                          ? formatRent(val, apt.rentCurrency)
                          : format.number(val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {locations.map((loc) => {
            const Icon = iconComponentFor(loc.icon);
            return (
              <tr key={`loc-${loc.id}`} className="border-b">
                <td
                  className="sticky left-0 z-10 bg-card px-4 py-2 font-medium"
                  title={t("travelTo", { label: loc.label })}
                >
                  <Icon className="h-4 w-4" aria-label={loc.label} />
                </td>
                {sortedVisible.map((apt) => {
                  const d = apt.distances[loc.id];
                  const bike = d?.bikeMin ?? null;
                  const transit = d?.transitMin ?? null;
                  return (
                    <td key={apt.id} className="px-4 py-2 font-mono text-xs">
                      {bike == null && transit == null ? (
                        "—"
                      ) : (
                        <>
                          {bike != null ? `${bike}` : "—"}
                          {" / "}
                          {transit != null ? t("minutes", { value: transit }) : t("noMinutes")}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          <tr className="border-b">
            <td className="sticky left-0 z-10 bg-card px-4 py-2 font-medium">
              {t("washingMachine")}
            </td>
            {sortedVisible.map((apt) => (
              <td
                key={apt.id}
                data-best={apt.hasWashingMachine === true ? "true" : undefined}
                className={cn(
                  "px-4 py-2",
                  apt.hasWashingMachine === true &&
                    "bg-secondary font-semibold dark:bg-primary dark:text-primary-foreground print:bg-transparent print:text-black print:underline"
                )}
                title={
                  apt.hasWashingMachine === true
                    ? t("washingYes")
                    : apt.hasWashingMachine === false
                      ? t("washingNo")
                      : t("washingUnknown")
                }
              >
                {apt.hasWashingMachine === true
                  ? "✓"
                  : apt.hasWashingMachine === false
                    ? "✕"
                    : "—"}
              </td>
            ))}
          </tr>

          {/* Who added each apartment (#430); the row only when anyone knows. */}
          {sortedVisible.some((apt) => apt.addedBy !== null) && (
            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-card px-4 py-2 font-medium">{t("addedBy")}</td>
              {sortedVisible.map((apt) => (
                <AddedByCell key={apt.id} addedBy={apt.addedBy} />
              ))}
            </tr>
          )}

          {allUserIds.map((userId) => {
            const label = userLabels.get(userId);
            return (
              <Fragment key={`user-${userId}`}>
                <tr className="border-b bg-muted/30">
                  <td
                    colSpan={visible.length + 1}
                    className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {t("userRatings", { name: label ?? "" })}
                  </td>
                </tr>
                {ratingKeys.map((rKey) => (
                  <tr key={`${userId}-${rKey}`} className="border-b">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 pl-8 text-muted-foreground">
                      {ratingLabel(rKey)}
                    </td>
                    {sortedVisible.map((apt) => {
                      const rating = apt.ratings.find(
                        (r) => r.userId === userId
                      );
                      return (
                        <td key={apt.id} className="px-4 py-2">
                          {rating ? (
                            <StarRating value={rating[rKey]} readonly size="sm" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr key={`${userId}-comment`} className="border-b">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2 pl-8 text-muted-foreground">
                    {t("comment")}
                  </td>
                  {sortedVisible.map((apt) => {
                    const rating = apt.ratings.find(
                      (r) => r.userId === userId
                    );
                    return (
                      <td
                        key={apt.id}
                        className="max-w-[200px] px-4 py-2 text-xs"
                      >
                        {rating?.comment || "—"}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}

          <tr className="border-b bg-muted/30">
            <td
              colSpan={visible.length + 1}
              className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t("averageRatings")}
            </td>
          </tr>
          {ratingKeys.map((rKey) => (
            <tr key={`avg-${rKey}`} className="border-b">
              <td className="sticky left-0 z-10 bg-card px-4 py-2 pl-8 font-medium">
                {ratingLabel(rKey)}
              </td>
              {sortedVisible.map((apt) => {
                const vals = apt.ratings
                  .map((r) => r[rKey])
                  .filter((v) => v > 0);
                const avg =
                  vals.length > 0
                    ? vals.reduce((a, b) => a + b, 0) / vals.length
                    : 0;
                return (
                  <td key={apt.id} className="px-4 py-2">
                    {avg > 0 ? (
                      <StarRating value={Math.round(avg)} readonly size="sm" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A hook per cell, so each column resolves its own member.
function AddedByCell({ addedBy }: { addedBy: string | null }) {
  const t = useTranslations("compare.table");
  const who = useAddedBy(addedBy);
  return (
    <td data-added-by className="px-4 py-2">
      {who === null ? "—" : who.kind === "you" ? t("addedByYou") : who.kind === "former" ? t("addedByFormer") : who.name}
    </td>
  );
}
