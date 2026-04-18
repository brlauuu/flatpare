"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/star-rating";
import { cn } from "@/lib/utils";

interface ApartmentWithRatings {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  rentChf: number | null;
  distanceBikeMin: number | null;
  distanceTransitMin: number | null;
  ratings: {
    userName: string;
    kitchen: number;
    balconies: number;
    location: number;
    floorplan: number;
    overallFeeling: number;
    comment: string;
  }[];
}

const metricRows = [
  { key: "rentChf", label: "Rent (CHF)", format: (v: number) => `${v.toLocaleString()}`, best: "min" },
  { key: "sizeM2", label: "Size (m²)", format: (v: number) => `${v}`, best: "max" },
  { key: "numRooms", label: "Rooms", format: (v: number) => `${v}`, best: "max" },
  { key: "numBathrooms", label: "Bathrooms", format: (v: number) => `${v}`, best: "max" },
  { key: "numBalconies", label: "Balconies", format: (v: number) => `${v}`, best: "max" },
  { key: "distanceBikeMin", label: "Bike to SBB", format: (v: number) => `${v} min`, best: "min" },
  { key: "distanceTransitMin", label: "Transit to SBB", format: (v: number) => `${v} min`, best: "min" },
] as const;

const ratingKeys = ["kitchen", "balconies", "location", "floorplan", "overallFeeling"] as const;
const ratingLabels: Record<string, string> = {
  kitchen: "Kitchen",
  balconies: "Balconies",
  location: "Location",
  floorplan: "Floorplan",
  overallFeeling: "Overall",
};

export default function ComparePage() {
  const [apartments, setApartments] = useState<ApartmentWithRatings[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/apartments");
      const list = await res.json();

      // Fetch full details for each apartment
      const details = await Promise.all(
        list.map(async (apt: { id: number }) => {
          const r = await fetch(`/api/apartments/${apt.id}`);
          return r.json();
        })
      );

      setApartments(details);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading comparison...</p>
      </div>
    );
  }

  const visible = apartments.filter((a) => !hiddenIds.has(a.id));

  if (apartments.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">No apartments to compare yet</p>
      </div>
    );
  }

  // Collect all unique user names
  const allUsers = [
    ...new Set(visible.flatMap((a) => a.ratings.map((r) => r.userName))),
  ];

  // Find best values for highlighting
  function findBest(key: string, direction: string) {
    const values = visible
      .map((a) => (a as unknown as Record<string, unknown>)[key] as number | null)
      .filter((v): v is number => v != null);
    if (values.length === 0) return null;
    return direction === "min" ? Math.min(...values) : Math.max(...values);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compare</h1>
        {hiddenIds.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHiddenIds(new Set())}
          >
            Show all ({hiddenIds.size} hidden)
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left font-medium">
                &nbsp;
              </th>
              {visible.map((apt) => (
                <th
                  key={apt.id}
                  className="min-w-[160px] px-4 py-3 text-left font-medium"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{apt.name}</div>
                      {apt.address && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {apt.address}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setHiddenIds((prev) => new Set([...prev, apt.id]))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Metric rows */}
            {metricRows.map((metric) => {
              const bestVal = findBest(metric.key, metric.best);
              return (
                <tr key={metric.key} className="border-b">
                  <td className="sticky left-0 z-10 bg-background px-4 py-2 font-medium">
                    {metric.label}
                  </td>
                  {visible.map((apt) => {
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

            {/* Rating rows per user */}
            {allUsers.map((user) => (
              <>
                <tr key={`header-${user}`} className="border-b bg-muted/30">
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
                    {visible.map((apt) => {
                      const rating = apt.ratings.find(
                        (r) => r.userName === user
                      );
                      return (
                        <td key={apt.id} className="px-4 py-2">
                          {rating ? (
                            <StarRating
                              value={rating[rKey]}
                              readonly
                              size="sm"
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Comment row */}
                <tr key={`${user}-comment`} className="border-b">
                  <td className="sticky left-0 z-10 bg-background px-4 py-2 pl-8 text-muted-foreground">
                    Comment
                  </td>
                  {visible.map((apt) => {
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
              </>
            ))}

            {/* Average row */}
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
                {visible.map((apt) => {
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
                        <StarRating
                          value={Math.round(avg)}
                          readonly
                          size="sm"
                        />
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
    </div>
  );
}
