"use client";

import { useMemo, useState } from "react";
import {
  compareApartments,
  isSortDirection,
  isSortField,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_FIELD_STORAGE_KEY,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import { useHouseholdData } from "@/components/household-data/use-household-data";

interface ApartmentPagerResult {
  loading: boolean;
  error: string | null;
  total: number;
  position: number | null;
  prevId: string | null;
  nextId: string | null;
}

function readSortField(): SortField {
  const raw = window.localStorage.getItem(SORT_FIELD_STORAGE_KEY);
  return raw !== null && isSortField(raw) ? raw : "createdAt";
}

function readSortDirection(): SortDirection {
  const raw = window.localStorage.getItem(SORT_DIRECTION_STORAGE_KEY);
  return raw !== null && isSortDirection(raw) ? raw : "desc";
}

// Prev/next neighbours of `currentId` under the list page's persisted sort.
// Reads the household store: no request, and the order matches what the user
// last saw on the list.
export function useApartmentPager(currentId: string): ApartmentPagerResult {
  const { status, error, apartments } = useHouseholdData();

  // Read sort preference once on mount — detail page does not need same-tab
  // sync because the user cannot change sort while on the detail page.
  const [sortField] = useState<SortField>(() => readSortField());
  const [sortDirection] = useState<SortDirection>(() => readSortDirection());

  return useMemo(() => {
    const loading = status === "loading";
    if (loading || status === "error") {
      return { loading, error, total: 0, position: null, prevId: null, nextId: null };
    }
    const sorted = [...apartments].sort((a, b) =>
      compareApartments(a, b, sortField, sortDirection)
    );
    const index = sorted.findIndex((a) => a.id === currentId);
    if (index === -1) {
      return { loading: false, error: null, total: sorted.length, position: null, prevId: null, nextId: null };
    }
    return {
      loading: false,
      error: null,
      total: sorted.length,
      position: index + 1,
      prevId: index > 0 ? sorted[index - 1].id : null,
      nextId: index < sorted.length - 1 ? sorted[index + 1].id : null,
    };
  }, [status, error, apartments, sortField, sortDirection, currentId]);
}
