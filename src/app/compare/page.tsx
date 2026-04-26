"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { StarRating } from "@/components/star-rating";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ExternalLink,
  FileText,
} from "lucide-react";
import { ErrorDisplay } from "@/components/error-display";
import {
  type ErrorDetails,
  fetchErrorFromResponse,
  fetchErrorFromException,
} from "@/lib/fetch-error";
import {
  compareApartments,
  compareSortOptions,
  COMPARE_SORT_CHANGE_EVENT,
  COMPARE_SORT_DIRECTION_STORAGE_KEY,
  COMPARE_SORT_FIELD_STORAGE_KEY,
  isSortDirection,
  isSortField,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import type { LocationOfInterest } from "@/lib/db/schema";
import { iconComponentFor } from "@/lib/location-icons";
import { usePersistedEnum } from "@/lib/use-persisted-enum";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

interface ApartmentWithRatings {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  distances: { locationId: number; bikeMin: number | null; transitMin: number | null }[];
  pdfUrl: string | null;
  listingUrl: string | null;
  shortCode: string | null;
  createdAt: string | null;
  avgOverall: string | null;
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
  const [locations, setLocations] = useState<LocationOfInterest[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [sortField, setSortField] = usePersistedEnum<SortField>(
    COMPARE_SORT_FIELD_STORAGE_KEY,
    COMPARE_SORT_CHANGE_EVENT,
    "rentChf",
    isSortField
  );
  const [sortDirection, setSortDirection] = usePersistedEnum<SortDirection>(
    COMPARE_SORT_DIRECTION_STORAGE_KEY,
    COMPARE_SORT_CHANGE_EVENT,
    "asc",
    isSortDirection
  );

  useEffect(() => {
    async function load() {
      const listUrl = "/api/apartments";
      try {
        const [res, locRes] = await Promise.all([
          fetch(listUrl),
          fetch("/api/locations"),
        ]);
        if (!res.ok) {
          setError({
            headline: "Couldn't load comparison data",
            details: await fetchErrorFromResponse(res, listUrl),
          });
          setLoading(false);
          return;
        }
        const list = (await res.json()) as { id: number }[];

        const details: ApartmentWithRatings[] = [];
        for (const apt of list) {
          const detailUrl = `/api/apartments/${apt.id}`;
          const r = await fetch(detailUrl);
          if (!r.ok) {
            setError({
              headline: "Couldn't load comparison data",
              details: await fetchErrorFromResponse(r, detailUrl),
            });
            setLoading(false);
            return;
          }
          details.push(await r.json());
        }

        setApartments(details);
        if (locRes.ok) {
          setLocations((await locRes.json()) as LocationOfInterest[]);
        }
        setLoading(false);
      } catch (err) {
        setError({
          headline: "Couldn't load comparison data",
          details: fetchErrorFromException(err, listUrl),
        });
        setLoading(false);
      }
    }
    load();
  }, []);

  const sortOptions = useMemo(() => compareSortOptions(locations), [locations]);

  const visible = apartments.filter((a) => !hiddenIds.has(a.id));
  const sortedVisible = useMemo(() => {
    return [...visible].sort((a, b) =>
      compareApartments(a, b, sortField, sortDirection)
    );
  }, [visible, sortField, sortDirection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading comparison...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <ErrorDisplay headline={error.headline} details={error.details} />
      </div>
    );
  }

  if (apartments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="rounded-full bg-muted p-4">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-medium">No apartments to compare yet</p>
          <p className="text-sm text-muted-foreground">
            Upload at least two listings to start comparing
          </p>
        </div>
        <Link href="/apartments/new" className={buttonVariants()}>
          Upload a listing
        </Link>
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Compare</h1>
        <div className="flex items-center gap-2">
          <Select
            value={sortField}
            onValueChange={(value) => setSortField(value as SortField)}
          >
            <SelectTrigger aria-label="Sort by" className="h-8 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={sortDirection === "asc" ? "Ascending" : "Descending"}
            onClick={() =>
              setSortDirection(sortDirection === "asc" ? "desc" : "asc")
            }
            className="h-8 w-8 p-0"
          >
            {sortDirection === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
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
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left font-medium">
                &nbsp;
              </th>
              {sortedVisible.map((apt) => (
                <th
                  key={apt.id}
                  className="min-w-[160px] px-4 py-3 text-left font-medium"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/apartments/${apt.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {apt.name}
                        </a>
                        {apt.pdfUrl && (
                          <a
                            href={apt.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`View PDF for ${apt.name}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {apt.listingUrl && (
                          <a
                            href={apt.listingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Original listing for ${apt.name}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <ShortCode code={apt.shortCode} />
                      {apt.address && (
                        <AddressLink
                          address={apt.address}
                          className="text-xs font-normal text-muted-foreground"
                        />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Hide ${apt.name}`}
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

            {/* Per-location distance rows. Header is icon-only with tooltip
                because 5 locations × bike+transit can otherwise crowd out the
                table. Each cell renders 'bike / transit' minutes inline. */}
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

            {/* Washing machine row */}
            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-background px-4 py-2 font-medium">
                Washing machine
              </td>
              {sortedVisible.map((apt) => (
                <td
                  key={apt.id}
                  className={cn(
                    "px-4 py-2",
                    apt.hasWashingMachine === true && "font-semibold text-green-600"
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
                    {sortedVisible.map((apt) => {
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
