"use client";

import { useSortText } from "@/components/use-sort-text";
import { CreditBalance } from "@/components/credit-balance";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  LayoutGrid,
  List as ListIcon,
  Map as MapIcon,
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
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { ApartmentCard } from "./_components/apartment-card";
import { ApartmentRow } from "./_components/apartment-row";
import { DraftsStrip } from "./_components/drafts-strip";
import { PasteLinkButton } from "./_components/paste-link-button";

type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "flatpare-apartments-view";
const VIEW_CHANGE_EVENT = "flatpare-apartments-view-change";

function isViewMode(v: string): v is ViewMode {
  return v === "grid" || v === "list";
}

export default function ApartmentsPage() {
  const t = useTranslations("apartments.list");
  const {
    status,
    error,
    apartments,
    locations,
    enrichmentError,
    retryEnrichment,
    runMaintenance,
    limits,
  } = useHouseholdData();
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

  // Listing-status check runs once per mount (spec: "on list-page mount"),
  // not on every store refresh.
  const listingsCheckedRef = useRef(false);
  useEffect(() => {
    if (listingsCheckedRef.current) return;
    listingsCheckedRef.current = true;
    void runMaintenance("listings").catch(() => {
      // best-effort background pass; failures are per-row and already
      // surfaced through the store's enrichment errors
    });
  }, [runMaintenance]);

  // Corrupt rows render as placeholders (below) rather than as ordinary
  // apartments, and — per docs/security-notes.md — are excluded from search
  // and sorting: they carry no real name, address or sortable fields, only a
  // "could not be decrypted" state and a delete action.
  const readableApartments = useMemo(
    () => apartments.filter((apt) => !apt.corrupt),
    [apartments]
  );
  const corruptApartments = useMemo(
    () => apartments.filter((apt) => apt.corrupt),
    [apartments]
  );

  const filteredApartments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return readableApartments;
    return readableApartments.filter((apt) => {
      const name = apt.name.toLowerCase();
      const code = apt.shortCode?.toLowerCase() ?? "";
      const addr = apt.address?.toLowerCase() ?? "";
      return name.includes(q) || code.includes(q) || addr.includes(q);
    });
  }, [readableApartments, query]);

  // The server enforces MAX_APARTMENTS regardless (POST /api/apartments
  // answers 409); this only keeps the UI honest about it.
  const atApartmentLimit =
    limits.maxApartments !== null && apartments.length >= limits.maxApartments;

  const sortedApartments = useMemo(
    () =>
      [...filteredApartments].sort((a, b) =>
        compareApartments(a, b, sortField, sortDirection)
      ),
    [filteredApartments, sortField, sortDirection]
  );

  const sortText = useSortText();
  const sortOptions = useMemo(() => listSortOptions(locations, sortText), [locations, sortText]);
  // Handed to the Select so its trigger shows the option's label ("Rent")
  // instead of the raw value ("rentChf"), which Base UI renders otherwise.
  const sortItems = useMemo(
    () => sortOptions.map((opt) => ({ value: opt.id, label: opt.label })),
    [sortOptions]
  );

  // Corrupt placeholders show up during normal browsing but drop out while
  // a search is active — they have no real name/address/code to match, so
  // showing them alongside a search's results would be misleading.
  const visibleCorruptApartments = useMemo(
    () => (query.trim() === "" ? corruptApartments : []),
    [corruptApartments, query]
  );

  const failedEnrichments = useMemo(
    () => apartments.filter((apt) => enrichmentError[apt.id] !== undefined),
    [apartments, enrichmentError]
  );

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay headline={error ?? t("loadError")} />
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
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
        <Link href="/apartments/new" className={buttonVariants()}>
          {t("uploadFirst")}
        </Link>
        <PasteLinkButton className="items-center" />
        <div className="w-full max-w-2xl">
          <DraftsStrip />
        </div>
        {/* Here too: a household that just bought, or deleted everything,
            holds no apartments and still has a balance (#305). */}
        <CreditBalance />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DraftsStrip />
      {failedEnrichments.length > 0 && (
        <div
          role="status"
          className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          {failedEnrichments.map((apt) => (
            <div key={apt.id} className="flex items-center justify-between gap-2">
              <span>{t("enrichmentFailed", { name: apt.name, error: enrichmentError[apt.id] })}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void retryEnrichment(apt.id)}
              >
                {t("retry")}
              </Button>
            </div>
          ))}
        </div>
      )}
      {/* The map button sits beside the search, as an icon (#408). */}
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            weight="frame"
            type="text"
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-9 pr-9 sm:h-9"
          />
          {query.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("clearSearch")}
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 p-0 sm:h-7 sm:w-7"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Link
          href="/map"
          aria-label={t("viewOnMap")}
          title={t("viewOnMap")}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-9")}
        >
          <MapIcon className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h1 className="title-page">{t("title")}</h1>
          {/* Only shown when a cap is configured: a self-hoster with no
              MAX_APARTMENTS must not see a counter implying one exists. */}
          {limits.maxApartments !== null && (
            <span className="text-sm text-muted-foreground">
              {t("heldCount", { count: apartments.length, max: limits.maxApartments })}
            </span>
          )}
          {/* Renders nothing when billing is off. */}
          <CreditBalance />
        </div>
        {/* Wraps on phones: the control cluster is ~390px wide and used to
            push the document past the viewport. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Select
            items={sortItems}
            value={sortField}
            onValueChange={(value) => setSortField(value as SortField)}
          >
            <SelectTrigger
              weight="frame"
              aria-label={t("sortBy")}
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
            aria-label={sortDirection === "asc" ? t("ascending") : t("descending")}
            onClick={() =>
              setSortDirection(sortDirection === "asc" ? "desc" : "asc")
            }
            className="h-11 w-11 p-0 sm:h-8 sm:w-8"
          >
            {sortDirection === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
          <div
            role="group"
            aria-label={t("view")}
            className="inline-flex rounded-md border bg-muted p-0.5"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("gridView")}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={cn(
                "h-11 w-11 gap-1 px-3 sm:h-7 sm:w-auto sm:px-2",
                view === "grid" && "bg-background shadow-sm"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("listView")}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "h-11 w-11 gap-1 px-3 sm:h-7 sm:w-auto sm:px-2",
                view === "list" && "bg-background shadow-sm"
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
          <PasteLinkButton />
          {atApartmentLimit ? (
            <span
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "h-11 w-full cursor-not-allowed opacity-60 sm:h-9 sm:w-auto"
              )}
              aria-disabled="true"
              title={t("limitTitle", { max: limits.maxApartments ?? 0 })}
            >
              {t("limitReached")}
            </span>
          ) : (
            <Link
              href="/apartments/new"
              className={cn(buttonVariants(), "h-11 w-full sm:h-9 sm:w-auto")}
            >
              {t("uploadNew")}
            </Link>
          )}
        </div>
      </div>

      {sortedApartments.length === 0 && query.trim() !== "" ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="rounded-full bg-muted p-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">{t("noMatch", { query: query.trim() })}</p>
          </div>
          <Button variant="outline" onClick={() => setQuery("")}>
            {t("showAll")}
          </Button>
        </div>
      ) : view === "grid" ? (
        <div
          data-view="grid"
          className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3"
        >
          {sortedApartments.map((apt) => (
            <ApartmentCard key={apt.id} apt={apt} />
          ))}
          {visibleCorruptApartments.map((apt) => (
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
          {visibleCorruptApartments.map((apt) => (
            <ApartmentRow key={apt.id} apt={apt} />
          ))}
        </div>
      )}
    </div>
  );
}
