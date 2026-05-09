import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/star-rating";
import { iconComponentFor } from "@/lib/location-icons";
import type { LocationOfInterest } from "@/lib/db/schema";
import { CompareColumnHeader } from "./compare-column-header";
import {
  metricRows,
  ratingKeys,
  ratingLabels,
  type ApartmentWithRatings,
} from "./compare-types";

interface CompareTableProps {
  visible: ApartmentWithRatings[];
  sortedVisible: ApartmentWithRatings[];
  locations: LocationOfInterest[];
  onHide: (id: number) => void;
}

export function CompareTable({
  visible,
  sortedVisible,
  locations,
  onHide,
}: CompareTableProps) {
  const allUsers = [
    ...new Set(visible.flatMap((a) => a.ratings.map((r) => r.userName))),
  ];

  function findBest(key: string, direction: string) {
    const values = visible
      .map(
        (a) =>
          (a as unknown as Record<string, unknown>)[key] as number | null
      )
      .filter((v): v is number => v != null);
    if (values.length === 0) return null;
    return direction === "min" ? Math.min(...values) : Math.max(...values);
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left font-medium">
              &nbsp;
            </th>
            {sortedVisible.map((apt) => (
              <CompareColumnHeader key={apt.id} apt={apt} onHide={onHide} />
            ))}
          </tr>
        </thead>
        <tbody>
          {metricRows.map((metric) => {
            const bestVal = findBest(metric.key, metric.best);
            return (
              <tr key={metric.key} className="border-b">
                <td className="sticky left-0 z-10 bg-background px-4 py-2 font-medium">
                  {metric.label}
                </td>
                {sortedVisible.map((apt) => {
                  const val = (apt as unknown as Record<string, unknown>)[
                    metric.key
                  ] as number | null;
                  const isBest = val != null && val === bestVal;
                  return (
                    <td
                      key={apt.id}
                      className={cn(
                        "px-4 py-2",
                        isBest && "font-semibold text-green-600"
                      )}
                    >
                      {val != null ? metric.format(val) : "—"}
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
                  className="sticky left-0 z-10 bg-background px-4 py-2 font-medium"
                  title={`Bike + transit to ${loc.label}`}
                >
                  <Icon className="h-4 w-4" aria-label={loc.label} />
                </td>
                {sortedVisible.map((apt) => {
                  const d = apt.distances.find(
                    (x) => x.locationId === loc.id
                  );
                  const bike = d?.bikeMin ?? null;
                  const transit = d?.transitMin ?? null;
                  return (
                    <td key={apt.id} className="px-4 py-2 text-xs">
                      {bike == null && transit == null ? (
                        "—"
                      ) : (
                        <>
                          {bike != null ? `${bike}` : "—"}
                          {" / "}
                          {transit != null ? `${transit} min` : "— min"}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          <tr className="border-b">
            <td className="sticky left-0 z-10 bg-background px-4 py-2 font-medium">
              Washing machine
            </td>
            {sortedVisible.map((apt) => (
              <td
                key={apt.id}
                className={cn(
                  "px-4 py-2",
                  apt.hasWashingMachine === true &&
                    "font-semibold text-green-600"
                )}
                title={
                  apt.hasWashingMachine === true
                    ? "Yes"
                    : apt.hasWashingMachine === false
                      ? "No (or shared)"
                      : "Unknown"
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

          {allUsers.map((user) => (
            <Fragment key={`user-${user}`}>
              <tr className="border-b bg-muted/30">
                <td
                  colSpan={visible.length + 1}
                  className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {user}&apos;s ratings
                </td>
              </tr>
              {ratingKeys.map((rKey) => (
                <tr key={`${user}-${rKey}`} className="border-b">
                  <td className="sticky left-0 z-10 bg-background px-4 py-2 pl-8 text-muted-foreground">
                    {ratingLabels[rKey]}
                  </td>
                  {sortedVisible.map((apt) => {
                    const rating = apt.ratings.find(
                      (r) => r.userName === user
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
              <tr key={`${user}-comment`} className="border-b">
                <td className="sticky left-0 z-10 bg-background px-4 py-2 pl-8 text-muted-foreground">
                  Comment
                </td>
                {sortedVisible.map((apt) => {
                  const rating = apt.ratings.find(
                    (r) => r.userName === user
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
          ))}

          <tr className="border-b bg-muted/30">
            <td
              colSpan={visible.length + 1}
              className="sticky left-0 z-10 bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Average Ratings
            </td>
          </tr>
          {ratingKeys.map((rKey) => (
            <tr key={`avg-${rKey}`} className="border-b">
              <td className="sticky left-0 z-10 bg-background px-4 py-2 pl-8 font-medium">
                {ratingLabels[rKey]}
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
