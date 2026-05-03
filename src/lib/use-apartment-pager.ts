"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareApartments,
  isSortDirection,
  isSortField,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_FIELD_STORAGE_KEY,
  type SortableApartment,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import {
  type ErrorDetails,
  fetchErrorFromException,
  fetchErrorFromResponse,
} from "@/lib/fetch-error";

interface ApartmentPagerResult {
  loading: boolean;
  error: ErrorDetails | null;
  total: number;
  position: number | null;
  prevId: number | null;
  nextId: number | null;
}

function readSortField(): SortField {
  const raw = window.localStorage.getItem(SORT_FIELD_STORAGE_KEY);
  return raw !== null && isSortField(raw) ? raw : "createdAt";
}

function readSortDirection(): SortDirection {
  const raw = window.localStorage.getItem(SORT_DIRECTION_STORAGE_KEY);
  return raw !== null && isSortDirection(raw) ? raw : "desc";
}

export function useApartmentPager(currentId: number): ApartmentPagerResult {
  const [apartments, setApartments] = useState<SortableApartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  // Read sort preference once on mount — detail page does not need same-tab
  // sync because the user cannot change sort while on the detail page.
  const [sortField] = useState<SortField>(() => readSortField());
  const [sortDirection] = useState<SortDirection>(() => readSortDirection());

  useEffect(() => {
    let cancelled = false;
    const url = "/api/apartments";
    (async () => {
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          setError(await fetchErrorFromResponse(res, url));
          setLoading(false);
          return;
        }
        const data = (await res.json()) as SortableApartment[];
        if (cancelled) return;
        setApartments(data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(fetchErrorFromException(err, url));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    if (loading || error) {
      return {
        loading,
        error,
        total: apartments.length,
        position: null,
        prevId: null,
        nextId: null,
      };
    }
    const sorted = [...apartments].sort((a, b) =>
      compareApartments(a, b, sortField, sortDirection)
    );
    const index = sorted.findIndex((a) => a.id === currentId);
    if (index === -1) {
      return {
        loading: false,
        error: null,
        total: sorted.length,
        position: null,
        prevId: null,
        nextId: null,
      };
    }
    return {
      loading: false,
      error: null,
      total: sorted.length,
      position: index + 1,
      prevId: index > 0 ? sorted[index - 1].id : null,
      nextId: index < sorted.length - 1 ? sorted[index + 1].id : null,
    };
  }, [loading, error, apartments, sortField, sortDirection, currentId]);
}
