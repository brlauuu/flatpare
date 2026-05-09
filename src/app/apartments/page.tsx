"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  LayoutGrid,
  List as ListIcon,
  Search,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorDisplay } from "@/components/error-display";
import { cn } from "@/lib/utils";
import {
  type ErrorDetails,
  fetchErrorFromResponse,
  fetchErrorFromException,
} from "@/lib/fetch-error";
import { usePersistedEnum } from "@/lib/use-persisted-enum";
import {
  compareApartments,
  SORT_FIELD_STORAGE_KEY,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_CHANGE_EVENT,
  isSortField,
  isSortDirection,
  listSortOptions,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import type { LocationOfInterest } from "@/lib/db/schema";
import { ApartmentsOverviewMap } from "@/components/apartments-overview-map";
import { ApartmentCard } from "./_components/apartment-card";
import { ApartmentRow } from "./_components/apartment-row";
import type { ApartmentSummary } from "./_components/apartment-summary";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "flatpare-apartments-view";
const VIEW_CHANGE_EVENT = "flatpare-apartments-view-change";

function isViewMode(v: string): v is ViewMode {
  return v === "grid" || v === "list";
}


export default function ApartmentsPage() {
  const [apartments, setApartments] = useState<ApartmentSummary[]>([]);
  const [locations, setLocations] = useState<LocationOfInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [view, setView] = usePersistedEnum<ViewMode>(
    VIEW_STORAGE_KEY,
    VIEW_CHANGE_EVENT,
    "grid",
    isViewMode
  );

  const [sortField, setSortField] = usePersistedEnum<SortField>(
    SORT_FIELD_STORAGE_KEY,
    SORT_CHANGE_EVENT,
    "createdAt",
    isSortField
  );
  const [sortDirection, setSortDirection] = usePersistedEnum<SortDirection>(
    SORT_DIRECTION_STORAGE_KEY,
    SORT_CHANGE_EVENT,
    "desc",
    isSortDirection
  );

  const [query, setQuery] = useState("");

  const filteredApartments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return apartments;
    return apartments.filter((apt) => {
      const name = apt.name?.toLowerCase() ?? "";
      const code = apt.shortCode?.toLowerCase() ?? "";
      const addr = apt.address?.toLowerCase() ?? "";
      return name.includes(q) || code.includes(q) || addr.includes(q);
    });
  }, [apartments, query]);

  const sortedApartments = useMemo(() => {
    return [...filteredApartments].sort((a, b) =>
      compareApartments(a, b, sortField, sortDirection)
    );
  }, [filteredApartments, sortField, sortDirection]);

  // Fetches apartments + locations. The optional listing-status check only
  // runs on the initial mount — re-fetches triggered by user switching just
  // need fresh ratings, not another network probe.
  async function reload(opts?: { runListingCheck?: boolean }) {
    const url = "/api/apartments";
    try {
      const [aptRes, locRes] = await Promise.all([
        fetch(url),
        fetch("/api/locations"),
      ]);
      if (!aptRes.ok) {
        setError({
          headline: "Couldn't load apartments",
          details: await fetchErrorFromResponse(aptRes, url),
        });
        setLoading(false);
        return;
      }
      setApartments((await aptRes.json()) as ApartmentSummary[]);
      if (locRes.ok) {
        setLocations((await locRes.json()) as LocationOfInterest[]);
      }
      setLoading(false);

      if (opts?.runListingCheck) {
        try {
          const checkRes = await fetch("/api/apartments/check-listings", {
            method: "POST",
          });
          if (checkRes.ok) {
            const refreshed = await fetch(url);
            if (refreshed.ok) {
              setApartments((await refreshed.json()) as ApartmentSummary[]);
            }
          }
        } catch {
          // background check failure is non-fatal
        }
      }
    } catch (err) {
      setError({
        headline: "Couldn't load apartments",
        details: fetchErrorFromException(err, url),
      });
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await reload({ runListingCheck: true });
    })();
  }, []);

  // Re-fetch when the active user switches so apartment cards show ratings
  // belonging to the new user, not the previous one.
  useEffect(() => {
    function handler() {
      void (async () => {
        await reload();
      })();
    }
    window.addEventListener("flatpare-user-changed", handler);
    return () => window.removeEventListener("flatpare-user-changed", handler);
  }, []);

  const sortOptions = useMemo(() => listSortOptions(locations), [locations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading apartments...</p>
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
          <Building2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-medium">No apartments yet</p>
          <p className="text-sm text-muted-foreground">
            Upload a PDF listing to get started
          </p>
        </div>
        <Link href="/apartments/new" className={buttonVariants()}>
          Upload your first listing
        </Link>
      </div>
    );
  }

  async function refreshAfterBackfill() {
    try {
      const [aptRes, locRes] = await Promise.all([
        fetch("/api/apartments"),
        fetch("/api/locations"),
      ]);
      if (aptRes.ok) {
        setApartments((await aptRes.json()) as ApartmentSummary[]);
      }
      if (locRes.ok) {
        setLocations((await locRes.json()) as LocationOfInterest[]);
      }
    } catch {
      // best-effort refresh
    }
  }

  return (
    <div className="space-y-6">
      <ApartmentsOverviewMap
        apartments={apartments}
        locations={locations}
        onBackfillComplete={refreshAfterBackfill}
      />
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          aria-label="Search apartments"
          placeholder="Search by name, code, or address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 pl-9 pr-9"
        />
        {query.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Apartments</h1>
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
          <div
            role="group"
            aria-label="View"
            className="inline-flex rounded-md border bg-muted p-0.5"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={cn(
                "h-7 gap-1 px-2",
                view === "grid" && "bg-background shadow-sm"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "h-7 gap-1 px-2",
                view === "list" && "bg-background shadow-sm"
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Link href="/apartments/new" className={buttonVariants()}>
            Upload New
          </Link>
        </div>
      </div>

      {sortedApartments.length === 0 && query.trim() !== "" ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="rounded-full bg-muted p-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">
              No apartments match &quot;{query.trim()}&quot;
            </p>
          </div>
          <Button variant="outline" onClick={() => setQuery("")}>
            Show all apartments
          </Button>
        </div>
      ) : view === "grid" ? (
        <div
          data-view="grid"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {sortedApartments.map((apt) => (
            <ApartmentCard key={apt.id} apt={apt} />
          ))}
        </div>
      ) : (
        <div
          data-view="list"
          className="divide-y overflow-hidden rounded-lg border"
        >
          {sortedApartments.map((apt) => (
            <ApartmentRow key={apt.id} apt={apt} />
          ))}
        </div>
      )}
    </div>
  );
}
