"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
import { ErrorDisplay } from "@/components/error-display";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";
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
import { usePersistedEnum } from "@/lib/use-persisted-enum";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { downloadPdf } from "@/components/household-data/pdf-files";
import type { ApartmentView } from "@/lib/household-data/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompareTable } from "./_components/compare-table";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

export default function ComparePage() {
  const { status, error: loadError, apartments, locations, identity, dataKey } =
    useHouseholdData();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
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

  const sortOptions = useMemo(() => compareSortOptions(locations), [locations]);

  // Corrupt rows have no plaintext to compare; the list page is where they
  // surface (with a delete action).
  const readable = useMemo(() => apartments.filter((a) => !a.corrupt), [apartments]);
  const visible = useMemo(
    () => readable.filter((a) => !hiddenIds.has(a.id)),
    [readable, hiddenIds]
  );
  const sortedVisible = useMemo(
    () => [...visible].sort((a, b) => compareApartments(a, b, sortField, sortDirection)),
    [visible, sortField, sortDirection]
  );

  async function handleViewPdf(apt: ApartmentView) {
    if (!apt.pdf) return;
    try {
      const bytes = await downloadPdf(dataKey, identity.householdId, apt.id, apt.pdf);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError({ headline: "Couldn't open PDF", details: errorDetailsFromException(err) });
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading comparison...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay
          headline="Couldn't load comparison data"
          details={{ message: loadError ?? undefined, timestamp: new Date().toISOString() }}
        />
      </div>
    );
  }

  if (readable.length === 0) {
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
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Compare</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Select
            value={sortField}
            onValueChange={(value) => setSortField(value as SortField)}
          >
            <SelectTrigger
              aria-label="Sort by"
              className="min-w-0 flex-1 data-[size=default]:h-11 sm:w-[160px] sm:flex-none sm:data-[size=default]:h-8"
            >
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
            onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
            className="h-11 w-11 p-0 sm:h-8 sm:w-8"
          >
            {sortDirection === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
          {hiddenIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={() => setHiddenIds(new Set())}>
              Show all ({hiddenIds.size} hidden)
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <CompareTable
        visible={visible}
        sortedVisible={sortedVisible}
        locations={locations}
        onHide={(id) => setHiddenIds((prev) => new Set([...prev, id]))}
        onViewPdf={(apt) => void handleViewPdf(apt)}
      />
    </div>
  );
}
