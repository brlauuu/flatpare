"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  Circle,
  LayoutGrid,
  List as ListIcon,
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
  SORT_FIELD_LABELS,
  SORT_FIELD_STORAGE_KEY,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_CHANGE_EVENT,
  SORT_FIELD_IDS,
  isSortField,
  isSortDirection,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

interface ApartmentSummary {
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
  shortCode: string | null;
  avgOverall: string | null;
  myRating: number | null;
  createdAt: string | null;
}

type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "flatpare-apartments-view";
const VIEW_CHANGE_EVENT = "flatpare-apartments-view-change";

function isViewMode(v: string): v is ViewMode {
  return v === "grid" || v === "list";
}


export default function ApartmentsPage() {
  const [apartments, setApartments] = useState<ApartmentSummary[]>([]);
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

  const sortedApartments = useMemo(() => {
    return [...apartments].sort((a, b) =>
      compareApartments(a, b, sortField, sortDirection)
    );
  }, [apartments, sortField, sortDirection]);

  useEffect(() => {
    const url = "/api/apartments";
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          setError({
            headline: "Couldn't load apartments",
            details: await fetchErrorFromResponse(res, url),
          });
          setLoading(false);
          return;
        }
        const data = (await res.json()) as ApartmentSummary[];
        setApartments(data);
        setLoading(false);
      } catch (err) {
        setError({
          headline: "Couldn't load apartments",
          details: fetchErrorFromException(err, url),
        });
        setLoading(false);
      }
    })();
  }, []);

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

  return (
    <div className="space-y-6">
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
              {SORT_FIELD_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {SORT_FIELD_LABELS[id]}
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

      {view === "grid" ? (
        <div
          data-view="grid"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {sortedApartments.map((apt) => (
            <Link key={apt.id} href={`/apartments/${apt.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <ShortCode code={apt.shortCode} size="md" />
                    <RatedBadge myRating={apt.myRating} />
                  </div>
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium leading-tight">{apt.name}</h3>
                    {apt.avgOverall && (
                      <StarRating
                        value={Math.round(parseFloat(apt.avgOverall))}
                        readonly
                        size="sm"
                      />
                    )}
                  </div>
                  {apt.address && (
                    <AddressLink
                      address={apt.address}
                      className="text-sm text-muted-foreground"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {apt.rentChf && (
                      <Badge variant="secondary">
                        CHF {apt.rentChf.toLocaleString()}
                      </Badge>
                    )}
                    {apt.sizeM2 && (
                      <Badge variant="secondary">{apt.sizeM2} m²</Badge>
                    )}
                    {apt.numRooms && (
                      <Badge variant="secondary">{apt.numRooms} rooms</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div
          data-view="list"
          className="divide-y overflow-hidden rounded-lg border"
        >
          {sortedApartments.map((apt) => (
            <Link
              key={apt.id}
              href={`/apartments/${apt.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ShortCode code={apt.shortCode} size="sm" />
                  <h3 className="truncate font-medium leading-tight">
                    {apt.name}
                  </h3>
                </div>
                {apt.address && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {apt.address}
                  </p>
                )}
              </div>
              <div className="hidden flex-wrap items-center gap-2 sm:flex">
                {apt.rentChf && (
                  <Badge variant="secondary">
                    CHF {apt.rentChf.toLocaleString()}
                  </Badge>
                )}
                {apt.numRooms && (
                  <Badge variant="secondary">{apt.numRooms} rm</Badge>
                )}
              </div>
              <div className="shrink-0">
                <RatedBadge myRating={apt.myRating} />
              </div>
              {apt.avgOverall && (
                <StarRating
                  value={Math.round(parseFloat(apt.avgOverall))}
                  readonly
                  size="sm"
                />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RatedBadge({ myRating }: { myRating: number | null }) {
  if (myRating !== null) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
      >
        <CheckCircle2 className="h-3 w-3" />
        Rated
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Circle className="h-3 w-3" />
      Not yet rated
    </Badge>
  );
}
