"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
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
import { usePersistedEnum } from "@/lib/use-persisted-enum";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompareTable } from "./_components/compare-table";
import type { ApartmentWithRatings } from "./_components/compare-types";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

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

      <CompareTable
        visible={visible}
        sortedVisible={sortedVisible}
        locations={locations}
        onHide={(id) => setHiddenIds((prev) => new Set([...prev, id]))}
      />
    </div>
  );
}
