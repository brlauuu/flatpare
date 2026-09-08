"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CryptoContext } from "@/components/crypto/crypto-provider";
import {
  openApartment,
  openLocation,
  openRating,
  sealApartment,
  sealLocation,
  sealRating,
} from "@/lib/household-data/codec";
import { mapConcurrent } from "@/lib/household-data/concurrency";
import { deriveApartments, deriveLocations } from "@/lib/household-data/derive";
import { planEnrichment, pruneDistances, type EnrichmentPlan } from "@/lib/household-data/enrich";
import {
  planDistanceMaintenance,
  planGeocodeMaintenance,
  planListingMaintenance,
  type MaintenanceKind,
  type MaintenanceReport,
} from "@/lib/household-data/maintenance";
import type {
  Apartment,
  ApartmentView,
  DecodedApartment,
  DecodedLocation,
  DecodedRating,
  Location,
  LocationView,
  Rating,
} from "@/lib/household-data/types";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";
import { ApiClientError, getJson, sendJson } from "./api-client";
import { enrichApartment } from "./enrichment";
import { checkListing, distanceBetween, geocodeAddress } from "./process-client";

export interface HouseholdIdentity {
  userId: string;
  householdId: number;
  userName: string;
}

export interface HouseholdDataContextValue {
  // Who is signed in and which household this store belongs to.
  identity: HouseholdIdentity;
  // The unlocked household data key (null in off mode). Pages that seal or
  // open PDFs themselves (upload, View PDF, reprocess) read it from here so
  // they never touch CryptoContext directly.
  dataKey: CryptoKey | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  apartments: ApartmentView[];
  locations: LocationView[];
  // Per-apartment message from the last failed enrichment; cleared on success.
  enrichmentError: Record<string, string>;
  reload(): Promise<void>;
  createApartment(id: string, data: Apartment): Promise<ApartmentView>;
  updateApartment(id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView>;
  deleteApartment(id: string): Promise<void>;
  rateApartment(id: string, rating: Rating | null): Promise<void>;
  retryEnrichment(id: string): Promise<void>;
  createLocation(id: string, data: Location): Promise<LocationView>;
  updateLocation(id: string, mutate: (l: Location) => Location): Promise<LocationView>;
  deleteLocation(id: string): Promise<void>;
  moveLocation(id: string, direction: "up" | "down"): Promise<void>;
  runMaintenance(
    kind: MaintenanceKind,
    onProgress?: (done: number, total: number) => void
  ): Promise<MaintenanceReport>;
}

// Exported so component tests can render consumers under a hand-built value
// (see __tests__/fake-household-data.tsx).
export const HouseholdDataContext = createContext<HouseholdDataContextValue | null>(null);

interface Store {
  apartments: DecodedApartment[];
  ratings: DecodedRating[];
  locations: DecodedLocation[];
}

const EMPTY_STORE: Store = { apartments: [], ratings: [], locations: [] };
const LISTING_CONCURRENCY = 4;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isStale(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && err.status === 409 && err.message === "Stale version";
}

// The one in-memory copy of the household's plaintext. Each signed-in layout
// mounts this as a child of <CryptoGate> (inside CryptoProvider), so it only
// exists while a usable data key does (or encryption is off); locking
// unmounts it. Not mounted by CryptoGate itself, to avoid a module cycle:
// this file imports CryptoContext from src/components/crypto, so
// src/components/crypto must import nothing back from here.
export function HouseholdDataProvider({
  identity,
  children,
}: {
  identity: HouseholdIdentity;
  children: React.ReactNode;
}) {
  const { userId, householdId } = identity;
  const dataKey = useContext(CryptoContext)?.keys?.dataKey ?? null;

  const [status, setStatus] = useState<HouseholdDataContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [enrichmentError, setEnrichmentError] = useState<Record<string, string>>({});

  // Async writers read the latest store through this ref rather than a
  // closure, so two awaited writes in a row see each other's result.
  const storeRef = useRef<Store>(EMPTY_STORE);
  const commit = useCallback((update: (prev: Store) => Store) => {
    storeRef.current = update(storeRef.current);
    setStore(storeRef.current);
  }, []);

  // ---- decode helpers ------------------------------------------------------

  const decodeApartment = useCallback(
    async (row: ApartmentRow): Promise<DecodedApartment> => {
      const data = await openApartment(dataKey, householdId, row.id, row.envelope);
      if (data === null) console.error(`[household-data] apartment ${row.id} could not be opened`);
      return { id: row.id, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt, data };
    },
    [dataKey, householdId]
  );

  const decodeRating = useCallback(
    async (row: RatingRow): Promise<DecodedRating> => {
      const data = await openRating(dataKey, householdId, row.apartmentId, row.userId, row.envelope);
      if (data === null) console.error(`[household-data] rating ${row.apartmentId}:${row.userId} could not be opened`);
      return { apartmentId: row.apartmentId, userId: row.userId, userName: row.userName, updatedAt: row.updatedAt, data };
    },
    [dataKey, householdId]
  );

  const decodeLocation = useCallback(
    async (row: LocationRow): Promise<DecodedLocation> => {
      const data = await openLocation(dataKey, householdId, row.id, row.envelope);
      if (data === null) console.error(`[household-data] location ${row.id} could not be opened`);
      return { id: row.id, sortOrder: row.sortOrder, data };
    },
    [dataKey, householdId]
  );

  // ---- load ----------------------------------------------------------------

  const reload = useCallback(async () => {
    try {
      const [aRows, rRows, lRows] = await Promise.all([
        getJson<ApartmentRow[]>("/api/apartments"),
        getJson<RatingRow[]>("/api/ratings"),
        getJson<LocationRow[]>("/api/locations"),
      ]);
      const [apartments, ratings, locations] = await Promise.all([
        Promise.all(aRows.map(decodeApartment)),
        Promise.all(rRows.map(decodeRating)),
        Promise.all(lRows.map(decodeLocation)),
      ]);
      commit(() => ({ apartments, ratings, locations }));
      setError(null);
      setStatus("ready");
    } catch (err) {
      setError(messageOf(err));
      setStatus("error");
    }
  }, [commit, decodeApartment, decodeLocation, decodeRating]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ---- views ---------------------------------------------------------------

  const apartments = useMemo(
    () => deriveApartments(store.apartments, store.ratings, userId),
    [store.apartments, store.ratings, userId]
  );
  const locations = useMemo(() => deriveLocations(store.locations), [store.locations]);

  const viewOf = useCallback(
    (id: string): ApartmentView => {
      const s = storeRef.current;
      const row = s.apartments.find((a) => a.id === id);
      if (!row) throw new Error("Apartment not found");
      return deriveApartments([row], s.ratings, userId)[0];
    },
    [userId]
  );
  const locationViewOf = useCallback((id: string): LocationView => {
    const view = deriveLocations(storeRef.current.locations).find((l) => l.id === id);
    if (!view) throw new Error("Location not found");
    return view;
  }, []);
  const currentLocations = useCallback(() => deriveLocations(storeRef.current.locations), []);

  // ---- apartments ----------------------------------------------------------

  const putApartment = useCallback(
    async (row: DecodedApartment, next: Apartment): Promise<void> => {
      const envelope = await sealApartment(dataKey, householdId, row.id, next);
      const saved = await sendJson<ApartmentRow>("PUT", `/api/apartments/${row.id}`, {
        version: row.version,
        envelope,
      });
      commit((s) => ({
        ...s,
        apartments: s.apartments.map((a) =>
          a.id === row.id
            ? { id: saved.id, version: saved.version, createdAt: saved.createdAt, updatedAt: saved.updatedAt, data: next }
            : a
        ),
      }));
    },
    [commit, dataKey, householdId]
  );

  const refetchApartment = useCallback(
    async (id: string): Promise<DecodedApartment> => {
      const rows = await getJson<ApartmentRow[]>("/api/apartments");
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("Apartment not found");
      const decoded = await decodeApartment(row);
      commit((s) => ({ ...s, apartments: s.apartments.map((a) => (a.id === id ? decoded : a)) }));
      return decoded;
    },
    [commit, decodeApartment]
  );

  // Seals the mutated cached plaintext with the cached version; on a stale
  // conflict refetches the row, re-applies the mutator and retries once.
  const writeApartment = useCallback(
    async (id: string, mutate: (a: Apartment) => Apartment): Promise<{ previous: Apartment; next: Apartment }> => {
      const attempt = async (row: DecodedApartment) => {
        if (row.data === null) throw new Error("This apartment could not be decrypted and cannot be edited");
        const next = pruneDistances(mutate(row.data), currentLocations());
        await putApartment(row, next);
        return { previous: row.data, next };
      };
      const row = storeRef.current.apartments.find((a) => a.id === id);
      if (!row) throw new Error("Apartment not found");
      try {
        return await attempt(row);
      } catch (err) {
        if (!isStale(err)) throw err;
        return attempt(await refetchApartment(id));
      }
    },
    [currentLocations, putApartment, refetchApartment]
  );

  const takenCodes = useCallback((except: string) => {
    const taken = new Set<string>();
    for (const a of storeRef.current.apartments) {
      if (a.id !== except && a.data?.shortCode) taken.add(a.data.shortCode);
    }
    return taken;
  }, []);

  // Runs a plan for one row and writes the result. Failures are recorded
  // per row in enrichmentError; the row itself is already saved.
  const runEnrichment = useCallback(
    async (id: string, plan: EnrichmentPlan): Promise<void> => {
      try {
        const row = storeRef.current.apartments.find((a) => a.id === id);
        if (!row || row.data === null) return;
        const enriched = await enrichApartment(row.data, currentLocations(), takenCodes(id), plan);
        await writeApartment(id, (a) => ({
          ...a,
          latitude: enriched.latitude,
          longitude: enriched.longitude,
          shortCode: enriched.shortCode,
          distances: enriched.distances,
        }));
        setEnrichmentError((prev) => {
          if (!(id in prev)) return prev;
          const rest = { ...prev };
          delete rest[id];
          return rest;
        });
      } catch (err) {
        setEnrichmentError((prev) => ({ ...prev, [id]: messageOf(err) }));
      }
    },
    [currentLocations, takenCodes, writeApartment]
  );

  const createApartment = useCallback(
    async (id: string, data: Apartment): Promise<ApartmentView> => {
      const envelope = await sealApartment(dataKey, householdId, id, data);
      const saved = await sendJson<ApartmentRow>("POST", "/api/apartments", { id, envelope });
      commit((s) => ({
        ...s,
        apartments: [
          ...s.apartments,
          { id: saved.id, version: saved.version, createdAt: saved.createdAt, updatedAt: saved.updatedAt, data },
        ],
      }));
      void runEnrichment(id, planEnrichment(null, data));
      return viewOf(id);
    },
    [commit, dataKey, householdId, runEnrichment, viewOf]
  );

  const updateApartment = useCallback(
    async (id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView> => {
      const { previous, next } = await writeApartment(id, mutate);
      const plan = planEnrichment(previous, next);
      if (plan.geocode || plan.shortCode || plan.distances) void runEnrichment(id, plan);
      return viewOf(id);
    },
    [runEnrichment, viewOf, writeApartment]
  );

  const retryEnrichment = useCallback(
    async (id: string): Promise<void> => {
      const row = storeRef.current.apartments.find((a) => a.id === id);
      if (!row || row.data === null) return;
      await runEnrichment(id, planEnrichment(null, row.data));
    },
    [runEnrichment]
  );

  const deleteApartment = useCallback(
    async (id: string): Promise<void> => {
      const row = storeRef.current.apartments.find((a) => a.id === id);
      const pdfPath = row?.data?.pdf?.path;
      await sendJson<void>("DELETE", `/api/apartments/${id}`, pdfPath ? { pdfPath } : undefined);
      commit((s) => ({
        ...s,
        apartments: s.apartments.filter((a) => a.id !== id),
        ratings: s.ratings.filter((r) => r.apartmentId !== id),
      }));
    },
    [commit]
  );

  const rateApartment = useCallback(
    async (id: string, rating: Rating | null): Promise<void> => {
      if (rating === null) {
        await sendJson<void>("DELETE", `/api/apartments/${id}/ratings/me`);
        commit((s) => ({
          ...s,
          ratings: s.ratings.filter((r) => !(r.apartmentId === id && r.userId === userId)),
        }));
        return;
      }
      const envelope = await sealRating(dataKey, householdId, id, userId, rating);
      const saved = await sendJson<RatingRow>("PUT", `/api/apartments/${id}/ratings/me`, { envelope });
      const decoded: DecodedRating = {
        apartmentId: saved.apartmentId,
        userId: saved.userId,
        userName: saved.userName,
        updatedAt: saved.updatedAt,
        data: rating,
      };
      commit((s) => ({
        ...s,
        ratings: [...s.ratings.filter((r) => !(r.apartmentId === id && r.userId === userId)), decoded],
      }));
    },
    [commit, dataKey, householdId, userId]
  );

  // ---- locations -----------------------------------------------------------

  // Recomputes distances from every located apartment to the given
  // locations and writes each touched row. Shared by the location writes
  // and runMaintenance("distances").
  const fillDistances = useCallback(
    async (
      targets: LocationView[],
      mode: "missing" | "all",
      onProgress?: (done: number, total: number) => void
    ): Promise<MaintenanceReport> => {
      const plan = planDistanceMaintenance(
        deriveApartments(storeRef.current.apartments, [], userId),
        targets,
        mode
      );
      const report: MaintenanceReport = { updated: 0, skipped: 0, failed: [] };
      let done = 0;
      for (const entry of plan) {
        try {
          const address = entry.apartment.address as string;
          const computed = await mapConcurrent(entry.locations, 3, (loc) =>
            distanceBetween(address, loc.address)
          );
          await writeApartment(entry.apartment.id, (a) => {
            const distances = { ...a.distances };
            entry.locations.forEach((loc, i) => {
              distances[loc.id] = computed[i];
            });
            return { ...a, distances };
          });
          report.updated++;
        } catch (err) {
          report.failed.push({ id: entry.apartment.id, reason: messageOf(err) });
        }
        onProgress?.(++done, plan.length);
      }
      return report;
    },
    [userId, writeApartment]
  );

  const geocodeLocation = useCallback(async (data: Location): Promise<Location> => {
    const geo = await geocodeAddress(data.address);
    return { ...data, latitude: geo.lat, longitude: geo.lng };
  }, []);

  const createLocation = useCallback(
    async (id: string, data: Location): Promise<LocationView> => {
      const located = await geocodeLocation(data);
      const envelope = await sealLocation(dataKey, householdId, id, located);
      const saved = await sendJson<LocationRow>("POST", "/api/locations", { id, envelope });
      commit((s) => ({
        ...s,
        locations: [...s.locations, { id: saved.id, sortOrder: saved.sortOrder, data: located }],
      }));
      const view = locationViewOf(id);
      void fillDistances([view], "all");
      return view;
    },
    [commit, dataKey, fillDistances, geocodeLocation, householdId, locationViewOf]
  );

  const updateLocation = useCallback(
    async (id: string, mutate: (l: Location) => Location): Promise<LocationView> => {
      const row = storeRef.current.locations.find((l) => l.id === id);
      if (!row || row.data === null) throw new Error("Location not found");
      let next = mutate(row.data);
      const addressChanged = next.address !== row.data.address;
      if (addressChanged) next = await geocodeLocation(next);
      const envelope = await sealLocation(dataKey, householdId, id, next);
      const saved = await sendJson<LocationRow>("PUT", `/api/locations/${id}`, { envelope });
      commit((s) => ({
        ...s,
        locations: s.locations.map((l) =>
          l.id === id ? { id: saved.id, sortOrder: saved.sortOrder, data: next } : l
        ),
      }));
      const view = locationViewOf(id);
      if (addressChanged) void fillDistances([view], "all");
      return view;
    },
    [commit, dataKey, fillDistances, geocodeLocation, householdId, locationViewOf]
  );

  // Apartments keep a stale `distances[id]` entry until their next write,
  // where pruneDistances drops it — cheaper than re-sealing every row now.
  const deleteLocation = useCallback(
    async (id: string): Promise<void> => {
      await sendJson<void>("DELETE", `/api/locations/${id}`);
      commit((s) => ({ ...s, locations: s.locations.filter((l) => l.id !== id) }));
    },
    [commit]
  );

  const moveLocation = useCallback(
    async (id: string, direction: "up" | "down"): Promise<void> => {
      const rows = await sendJson<LocationRow[]>("POST", `/api/locations/${id}/move`, { direction });
      const order = new Map(rows.map((r) => [r.id, r.sortOrder]));
      commit((s) => ({
        ...s,
        locations: s.locations.map((l) => ({ ...l, sortOrder: order.get(l.id) ?? l.sortOrder })),
      }));
    },
    [commit]
  );

  // ---- maintenance ---------------------------------------------------------

  const runMaintenance = useCallback(
    async (
      kind: MaintenanceKind,
      onProgress?: (done: number, total: number) => void
    ): Promise<MaintenanceReport> => {
      const views = deriveApartments(storeRef.current.apartments, storeRef.current.ratings, userId);
      const report: MaintenanceReport = { updated: 0, skipped: 0, failed: [] };

      if (kind === "geocode") {
        const targets = planGeocodeMaintenance(views);
        let done = 0;
        for (const apt of targets) {
          try {
            const row = storeRef.current.apartments.find((a) => a.id === apt.id);
            if (!row || row.data === null) {
              report.skipped++;
            } else {
              const enriched = await enrichApartment(row.data, currentLocations(), takenCodes(apt.id), {
                geocode: true,
                shortCode: row.data.shortCode === null,
                distances: true,
              });
              if (enriched.latitude === null) {
                report.skipped++;
              } else {
                await writeApartment(apt.id, (a) => ({
                  ...a,
                  latitude: enriched.latitude,
                  longitude: enriched.longitude,
                  shortCode: enriched.shortCode,
                  distances: enriched.distances,
                }));
                report.updated++;
              }
            }
          } catch (err) {
            report.failed.push({ id: apt.id, reason: messageOf(err) });
          }
          onProgress?.(++done, targets.length);
        }
        return report;
      }

      if (kind === "distances") {
        return fillDistances(currentLocations(), "all", onProgress);
      }

      // listings
      const targets = planListingMaintenance(views);
      let done = 0;
      await mapConcurrent(targets, LISTING_CONCURRENCY, async (apt) => {
        try {
          const gone = await checkListing(apt.listingUrl as string);
          if (gone === null || gone === apt.listingGone) {
            report.skipped++;
          } else {
            await writeApartment(apt.id, (a) => ({
              ...a,
              listingGone: gone,
              listingCheckedAt: new Date().toISOString(),
            }));
            report.updated++;
          }
        } catch (err) {
          report.failed.push({ id: apt.id, reason: messageOf(err) });
        }
        onProgress?.(++done, targets.length);
      });
      return report;
    },
    [currentLocations, fillDistances, takenCodes, userId, writeApartment]
  );

  // ---- context -------------------------------------------------------------

  const value = useMemo<HouseholdDataContextValue>(
    () => ({
      identity,
      dataKey,
      status,
      error,
      apartments,
      locations,
      enrichmentError,
      reload,
      createApartment,
      updateApartment,
      deleteApartment,
      rateApartment,
      retryEnrichment,
      createLocation,
      updateLocation,
      deleteLocation,
      moveLocation,
      runMaintenance,
    }),
    [
      identity, dataKey, status, error, apartments, locations, enrichmentError, reload,
      createApartment, updateApartment, deleteApartment, rateApartment, retryEnrichment,
      createLocation, updateLocation, deleteLocation, moveLocation, runMaintenance,
    ]
  );

  return <HouseholdDataContext.Provider value={value}>{children}</HouseholdDataContext.Provider>;
}
