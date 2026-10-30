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
import { usePathname } from "next/navigation";
import { CryptoContext } from "@/components/crypto/crypto-context";
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
import { hasAddress, planEnrichment, pruneDistances, type EnrichmentPlan } from "@/lib/household-data/enrich";
import { lettersOf, postcodeFromShortCode, syncShortCode, withPostcode } from "@/lib/household-data/short-code";
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
import { adoptDrafts, fetchDrafts } from "./drafts";
import { enrichApartment } from "./enrichment";
import { deletePdfFile, encryptAndUploadPdf, pdfRevision } from "./pdf-files";
import { checkListing, distanceBetween, geocodeAddress } from "./process-client";
import { isStaleKey, runRotateDataKey, type RotationReport } from "./rotation";
import {
  buildExportZip,
  exportFileName,
  readExportFile,
  runImport,
  type ImportReport,
} from "./export-import";
import {
  planImport,
  type ParsedExport,
  type RatingLine,
} from "@/lib/household-data/export-format";
import { newRowId } from "@/lib/household-data/ids";
import { apartmentFromLink, firstHttpUrl } from "@/lib/household-data/links";
import type { Limits } from "@/lib/limits";
import { displayName } from "@/lib/display-name";

export interface HouseholdIdentity {
  userId: string;
  householdId: number;
  userName: string;
  // From the session token, so up to 24h stale (see Auth in AGENTS.md). Fine
  // for deciding what to SHOW; every owner-only action is re-checked by its
  // route against the database.
  role: "owner" | "member";
}

export interface HouseholdDataContextValue {
  // Who is signed in and which household this store belongs to.
  identity: HouseholdIdentity;
  // E5 entitlements, read server-side and passed down the same way as
  // `identity` — a "use client" file must never read process.env. null on an
  // axis means unlimited, which is the self-hoster's default; the server
  // enforces these regardless of what the UI does with them.
  limits: Limits;
  // Remaining apartment credits (#305), shared by the whole household (#294).
  // null when billing is off, and until the first answer arrives — "nothing
  // to show", never "zero".
  credits: Credits | null;
  // Each current member's name by user id (#430), for "Added by". Read from
  // the members list beside each load, so a rename shows; null until the
  // first answer, so nothing is shown as a former member meanwhile. A user
  // id missing from it has left the household.
  memberNames: Record<string, string> | null;
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
  // #413. An unprocessed apartment made from a pasted or shared link; free.
  // Rejects with "Not a web link" before any request when the text holds no
  // http(s) link.
  createApartmentFromLink(text: string, title: string | null): Promise<ApartmentView>;
  // Attaches a PDF to an apartment, or replaces the one it has: the new file
  // is stored under a fresh name, the row is pointed at it, and only then is
  // the old file deleted. Stores only; reading it is the caller's choice.
  attachPdf(id: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  updateApartment(id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView>;
  deleteApartment(id: string): Promise<void>;
  rateApartment(id: string, rating: Rating | null): Promise<void>;
  retryEnrichment(id: string): Promise<void>;
  // #413. Processes an apartment that has an address but was never geocoded
  // (its first processing spends one credit); rejects with the failure, a
  // 402 when no credit is left, where retryEnrichment only records it.
  processApartment(id: string): Promise<void>;
  // A reprocess (#413) is charged by explicit request, one credit, before the
  // page reads the PDF again; then `relocateApartment` writes what the PDF
  // gave (`mutate`), geocodes the address and measures every distance again,
  // at no further charge.
  chargeReprocess(id: string): Promise<void>;
  relocateApartment(id: string, mutate?: (a: Apartment) => Apartment): Promise<void>;
  createLocation(id: string, data: Location): Promise<LocationView>;
  updateLocation(id: string, mutate: (l: Location) => Location): Promise<LocationView>;
  deleteLocation(id: string): Promise<void>;
  moveLocation(id: string, direction: "up" | "down"): Promise<void>;
  runMaintenance(
    kind: MaintenanceKind,
    onProgress?: (done: number, total: number) => void
  ): Promise<MaintenanceReport>;
  // Data-key rotation (#219): owner only, encryption on. Re-seals every row
  // and PDF under a fresh key, re-wraps it to every member, and mints a new
  // recovery kit — the returned code must be shown to the owner once.
  rotateDataKey(): Promise<{ recoveryCode: string; report: RotationReport }>;
  // Export and import (#191). The export is a plaintext ZIP of everything
  // this member can read; any member may take one. The import only runs
  // into an empty household (no apartments, no locations) and calls no
  // outside service; `ratingLine` puts other people's ratings into words in
  // the importer's language.
  exportHousehold(): Promise<{ blob: Blob; fileName: string; missingPdfs: number }>;
  readImport(file: Blob): Promise<ParsedExport>;
  importHousehold(
    parsed: ParsedExport,
    ratingLine: RatingLine,
    onProgress?: (done: number, total: number) => void
  ): Promise<ImportReport>;
}

export interface Credits {
  granted: number;
  used: number;
  remaining: number;
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

const STALE_KEY_MESSAGE =
  "The household key was changed by the owner. Your data has been reloaded; please try again.";

// Thrown when a write is refused because the owner rotated the household
// key (#219). Its own class so a page can show the message in the reader's
// language (useStoreErrorDetails, #288); the English message stays for logs
// and for callers that show err.message as is.
export class StaleKeyError extends Error {
  constructor() {
    super(STALE_KEY_MESSAGE);
    this.name = "StaleKeyError";
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// The server refused a charge: the household has no credits left (#413).
function isNoCredits(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 402;
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
  limits,
  children,
}: {
  identity: HouseholdIdentity;
  limits: Limits;
  children: React.ReactNode;
}) {
  const { userId, householdId } = identity;
  const crypto = useContext(CryptoContext);
  const dataKey = crypto?.keys?.dataKey ?? null;
  // The version of the key we seal under (#219). The server refuses any
  // other; an old device record without a version is version 1.
  const keyVersion = crypto?.keys?.keyVersion ?? 1;
  const refreshCrypto = crypto?.refresh;

  const [status, setStatus] = useState<HouseholdDataContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [enrichmentError, setEnrichmentError] = useState<Record<string, string>>({});
  const [credits, setCredits] = useState<Credits | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string> | null>(null);
  // Counts finished loads, so the draft conversion runs once after each.
  const [loads, setLoads] = useState(0);

  // Read from the server rather than counted here: another member's add
  // spends from the same pool, and a refused or refunded create does not move
  // the counter at all. Never blocks or fails anything — a balance that could
  // not be read keeps the last one shown.
  const refreshCredits = useCallback(async () => {
    try {
      const b = await getJson<Credits & { enabled: boolean }>("/api/billing/status");
      setCredits(b.enabled ? { granted: b.granted, used: b.used, remaining: b.remaining } : null);
    } catch {
      // Keep what is on screen.
    }
  }, []);

  // Same posture as the balance: beside the rows, never failing the page.
  const refreshMembers = useCallback(async () => {
    try {
      const { members } = await getJson<{ members: { userId: string; name: string | null; email: string }[] }>(
        "/api/household/members"
      );
      setMemberNames(Object.fromEntries(members.map((m) => [m.userId, displayName(m.name, m.email)])));
    } catch {
      // Keep what is on screen.
    }
  }, []);

  // Async writers read the latest store through this ref rather than a
  // closure, so two awaited writes in a row see each other's result.
  const storeRef = useRef<Store>(EMPTY_STORE);
  // Counts commits, so a background refresh can tell that something was
  // written while it was in flight and step aside.
  const commits = useRef(0);
  const commit = useCallback((update: (prev: Store) => Store) => {
    commits.current += 1;
    storeRef.current = update(storeRef.current);
    setStore(storeRef.current);
  }, []);

  // Every envelope write goes through here. A `409 Stale key` means the
  // owner rotated the household key (#219) and this device still holds the
  // old one: refresh the crypto status — which adopts the new wrap, changes
  // `dataKey`, and makes this store reload — and tell the caller to retry.
  const send = useCallback(
    async <T,>(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<T> => {
      try {
        return await sendJson<T>(method, url, body);
      } catch (err) {
        if (!isStaleKey(err)) throw err;
        if (refreshCrypto) void refreshCrypto();
        throw new StaleKeyError();
      }
    },
    [refreshCrypto]
  );

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

  const load = useCallback(async (background: boolean) => {
    const commitsAtStart = commits.current;
    // Beside the rows, not part of them: the page must not wait on it.
    void refreshCredits();
    void refreshMembers();
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
      // A write landed while a background refresh was in flight: what was
      // fetched may predate it, and replacing the store would take the
      // user's own change off the screen. Drop it; the next refresh catches
      // up.
      if (background && commits.current !== commitsAtStart) return;
      commit(() => ({ apartments, ratings, locations }));
      setError(null);
      setStatus("ready");
      setLoads((n) => n + 1);
    } catch (err) {
      // A failed background refresh keeps what is on screen rather than
      // replacing a working page with an error.
      if (background) return;
      setError(messageOf(err));
      setStatus("error");
    }
  }, [commit, decodeApartment, decodeLocation, decodeRating, refreshCredits, refreshMembers]);

  const reload = useCallback(() => load(false), [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Refresh when the user moves to another section (#302). The store now
  // outlives a section switch — it sits in the shared layout — where it used
  // to be rebuilt on every one, which was also the only way another member's
  // changes ever arrived without a full reload. This keeps that, without the
  // wait: the page renders from what is already decrypted and the refresh
  // lands behind it.
  const section = usePathname()?.split("/")[1] ?? null;
  const lastSection = useRef(section);
  useEffect(() => {
    if (lastSection.current === section) return;
    lastSection.current = section;
    // Still on the first load (or failed): that path owns the status.
    if (status !== "ready") return;
    void load(true);
  }, [section, status, load]);

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
      const envelope = await sealApartment(dataKey, householdId, row.id, next, keyVersion);
      const saved = await send<ApartmentRow>("PUT", `/api/apartments/${row.id}`, {
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
    [commit, dataKey, householdId, keyVersion, send]
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

  const takenLetters = useCallback((except: string) => {
    const taken = new Set<string>();
    for (const a of storeRef.current.apartments) {
      const letters = a.id === except ? null : lettersOf(a.data?.shortCode ?? null);
      if (letters) taken.add(letters);
    }
    return taken;
  }, []);

  // Enrichment ran on a snapshot; the row may have been edited since. Take
  // only the geocoded postcode from it and rebuild the code from the row as
  // it is now, so a letters or rooms change made meanwhile is kept.
  const geocodedCode = useCallback(
    (id: string, current: Apartment, enriched: Apartment) =>
      withPostcode(current, postcodeFromShortCode(enriched.shortCode ?? ""), takenLetters(id)).shortCode,
    [takenLetters]
  );

  // Runs a plan for one row and writes the result. Failures are recorded
  // per row in enrichmentError, and returned; the row itself is already
  // saved. A refusal for want of credit (#413) is not recorded: the
  // apartment stays unprocessed, and its page says so.
  //
  // The geocode names the apartment only when it is the apartment's first
  // processing, which is what the server charges (#413). An apartment
  // already processed (by its PDF, or before) is geocoded without it: its
  // credit is spent, and a retry must never spend another.
  const runEnrichment = useCallback(
    async (id: string, plan: EnrichmentPlan): Promise<unknown> => {
      const row = storeRef.current.apartments.find((a) => a.id === id);
      if (!row || row.data === null) return null;
      const charging = plan.geocode && !row.data.processed;
      try {
        const enriched = await enrichApartment(
          row.data,
          currentLocations(),
          takenLetters(id),
          plan,
          Math.random,
          charging ? id : undefined
        );
        await writeApartment(id, (a) => ({
          ...a,
          latitude: enriched.latitude,
          longitude: enriched.longitude,
          shortCode: plan.geocode ? geocodedCode(id, a, enriched) : a.shortCode,
          distances: enriched.distances,
          processed: a.processed || enriched.processed,
          processedAddress: plan.geocode ? enriched.processedAddress : a.processedAddress,
        }));
        setEnrichmentError((prev) => {
          if (!(id in prev)) return prev;
          const rest = { ...prev };
          delete rest[id];
          return rest;
        });
        return null;
      } catch (err) {
        if (!isNoCredits(err)) setEnrichmentError((prev) => ({ ...prev, [id]: messageOf(err) }));
        return err;
      } finally {
        if (charging) void refreshCredits();
      }
    },
    [currentLocations, geocodedCode, refreshCredits, takenLetters, writeApartment]
  );

  const createApartment = useCallback(
    async (id: string, given: Apartment, addedBy: string | null = userId): Promise<ApartmentView> => {
      // Who added it (#430): the member creating it, unless the caller knows
      // better (a draft records who saved it, or nobody).
      const data = syncShortCode(null, { ...given, addedBy }, takenLetters(id));
      const envelope = await sealApartment(dataKey, householdId, id, data, keyVersion);
      // Creating spends no credit (#413); the first processing does.
      const saved = await send<ApartmentRow>("POST", "/api/apartments", { id, envelope });
      commit((s) => ({
        ...s,
        apartments: [
          ...s.apartments,
          { id: saved.id, version: saved.version, createdAt: saved.createdAt, updatedAt: saved.updatedAt, data },
        ],
      }));
      // The PDF read before this create spent the credit, if there was one.
      if (data.processed) void refreshCredits();
      void runEnrichment(id, planEnrichment(data));
      return viewOf(id);
    },
    [commit, dataKey, householdId, keyVersion, refreshCredits, runEnrichment, send, takenLetters, userId, viewOf]
  );

  const createApartmentFromLink = useCallback(
    async (text: string, title: string | null): Promise<ApartmentView> => {
      const link = firstHttpUrl(text);
      if (link === null) throw new Error("Not a web link");
      return createApartment(newRowId(), apartmentFromLink(link, title));
    },
    [createApartment]
  );

  // Drafts left from before #413 become apartments once the rows are loaded
  // (adoptDrafts), from whichever member's device loads first. After the
  // load, not inside it: a draft that fails to convert must not fail the
  // page, and the conversion is a create like any other.
  // No draft is created any more, so once none is left there is nothing to
  // look for again while this provider is mounted.
  const adopting = useRef(false);
  const noDraftsLeft = useRef(false);
  useEffect(() => {
    if (loads === 0 || adopting.current || noDraftsLeft.current) return;
    adopting.current = true;
    void fetchDrafts(dataKey, householdId)
      .then((drafts) => {
        if (drafts.length === 0) noDraftsLeft.current = true;
        return adoptDrafts(drafts, createApartment);
      })
      .catch(() => {
        // The next load tries again.
      })
      .finally(() => {
        adopting.current = false;
      });
    // Once per load, with that load's createApartment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loads]);

  const attachPdf = useCallback(
    async (id: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
      // A fresh name every time: Blob refuses to write over a file, and the
      // old file must stay readable until the row points at the new one.
      const pdf = await encryptAndUploadPdf(dataKey, householdId, id, bytes, keyVersion, pdfRevision());
      let previous: Apartment;
      try {
        ({ previous } = await writeApartment(id, (a) => ({ ...a, pdf })));
      } catch (err) {
        void deletePdfFile(pdf.path);
        throw err;
      }
      if (previous.pdf && previous.pdf.path !== pdf.path) void deletePdfFile(previous.pdf.path);
    },
    [dataKey, householdId, keyVersion, writeApartment]
  );

  const updateApartment = useCallback(
    async (id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView> => {
      const { previous, next } = await writeApartment(id, (a) => syncShortCode(a, mutate(a), takenLetters(id)));
      // A PDF read for this apartment just now spent its credit (#413).
      if (next.processed && !previous.processed) void refreshCredits();
      const plan = planEnrichment(next);
      if (plan.geocode || plan.distances) void runEnrichment(id, plan);
      return viewOf(id);
    },
    [refreshCredits, runEnrichment, takenLetters, viewOf, writeApartment]
  );

  const retryEnrichment = useCallback(
    async (id: string): Promise<void> => {
      const row = storeRef.current.apartments.find((a) => a.id === id);
      if (!row || row.data === null) return;
      await runEnrichment(id, planEnrichment(row.data));
    },
    [runEnrichment]
  );

  const processApartment = useCallback(
    async (id: string): Promise<void> => {
      const row = storeRef.current.apartments.find((a) => a.id === id);
      if (!row || row.data === null) throw new Error("Apartment not found");
      const err = await runEnrichment(id, planEnrichment(row.data));
      if (err) throw err;
    },
    [runEnrichment]
  );

  const chargeReprocess = useCallback(
    async (id: string): Promise<void> => {
      try {
        await sendJson<{ ok: true }>("POST", `/api/apartments/${id}/reprocess`);
      } finally {
        void refreshCredits();
      }
    },
    [refreshCredits]
  );

  // The rest of a reprocess already charged by chargeReprocess: writes what
  // the PDF gave, then geocodes the address and measures every distance
  // again. What belonged to the old address is dropped in the same write, so
  // an apartment without an address keeps no coordinates or distances.
  const relocateApartment = useCallback(
    async (id: string, mutate: (a: Apartment) => Apartment = (a) => a): Promise<void> => {
      const { next } = await writeApartment(id, (a) =>
        syncShortCode(
          a,
          { ...mutate(a), processed: true, latitude: null, longitude: null, distances: {}, processedAddress: null },
          takenLetters(id)
        )
      );
      if (!hasAddress(next)) return;
      const err = await runEnrichment(id, { geocode: true, distances: true });
      if (err) throw err;
    },
    [runEnrichment, takenLetters, writeApartment]
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
      const envelope = await sealRating(dataKey, householdId, id, userId, rating, keyVersion);
      const saved = await send<RatingRow>("PUT", `/api/apartments/${id}/ratings/me`, { envelope });
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
    [commit, dataKey, householdId, keyVersion, send, userId]
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
      const envelope = await sealLocation(dataKey, householdId, id, located, keyVersion);
      const saved = await send<LocationRow>("POST", "/api/locations", { id, envelope });
      commit((s) => ({
        ...s,
        locations: [...s.locations, { id: saved.id, sortOrder: saved.sortOrder, data: located }],
      }));
      const view = locationViewOf(id);
      void fillDistances([view], "all");
      return view;
    },
    [commit, dataKey, fillDistances, geocodeLocation, householdId, keyVersion, locationViewOf, send]
  );

  const updateLocation = useCallback(
    async (id: string, mutate: (l: Location) => Location): Promise<LocationView> => {
      const row = storeRef.current.locations.find((l) => l.id === id);
      if (!row || row.data === null) throw new Error("Location not found");
      let next = mutate(row.data);
      const addressChanged = next.address !== row.data.address;
      if (addressChanged) next = await geocodeLocation(next);
      const envelope = await sealLocation(dataKey, householdId, id, next, keyVersion);
      const saved = await send<LocationRow>("PUT", `/api/locations/${id}`, { envelope });
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
    [commit, dataKey, fillDistances, geocodeLocation, householdId, keyVersion, locationViewOf, send]
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
              const enriched = await enrichApartment(row.data, currentLocations(), takenLetters(apt.id), {
                geocode: true,
                distances: true,
              });
              if (enriched.latitude === null) {
                report.skipped++;
              } else {
                // Planned only for processed apartments, so the geocode named
                // no apartment and spent nothing (#413).
                await writeApartment(apt.id, (a) => ({
                  ...a,
                  latitude: enriched.latitude,
                  longitude: enriched.longitude,
                  shortCode: geocodedCode(apt.id, a, enriched),
                  distances: enriched.distances,
                  processedAddress: enriched.processedAddress,
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
        // One credit for the whole run (#413), asked for before anything is
        // measured. A new or moved location measures through fillDistances
        // directly, and stays free.
        try {
          await sendJson<{ ok: true }>("POST", "/api/billing/recompute");
        } finally {
          void refreshCredits();
        }
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
    [currentLocations, fillDistances, geocodedCode, refreshCredits, takenLetters, userId, writeApartment]
  );

  // ---- rotation ------------------------------------------------------------

  const rotateDataKey = useCallback(async () => {
    if (!crypto?.status || !crypto.keys) {
      throw new Error("Encryption is off or the keys are not loaded");
    }
    const result = await runRotateDataKey(crypto.status, crypto.keys);
    // The device now holds the new key; refreshing the crypto status swaps
    // it into context, which makes this store reload under the new key.
    await crypto.refresh();
    return result;
  }, [crypto]);

  // ---- export and import (#191) --------------------------------------------

  const exportHousehold = useCallback(async () => {
    const now = new Date();
    const { blob, missingPdfs } = await buildExportZip(storeRef.current, { dataKey, householdId, keyVersion }, now);
    return { blob, fileName: exportFileName(now), missingPdfs };
  }, [dataKey, householdId, keyVersion]);

  const readImport = useCallback((file: Blob) => readExportFile(file), []);

  const importHousehold = useCallback(
    async (
      parsed: ParsedExport,
      ratingLine: RatingLine,
      onProgress?: (done: number, total: number) => void
    ): Promise<ImportReport> => {
      const s = storeRef.current;
      if (s.apartments.length > 0 || s.locations.length > 0) {
        throw new Error("Import needs an empty household");
      }
      const plan = planImport(parsed, userId, newRowId, ratingLine);
      try {
        return await runImport(plan, { dataKey, householdId, keyVersion, userId }, onProgress);
      } finally {
        // Whatever landed, the screen should show it, and the balance moved.
        await load(false);
      }
    },
    [dataKey, householdId, keyVersion, load, userId]
  );

  // ---- context -------------------------------------------------------------

  const value = useMemo<HouseholdDataContextValue>(
    () => ({
      identity,
      limits,
      dataKey,
      status,
      error,
      apartments,
      locations,
      enrichmentError,
      credits,
      memberNames,
      reload,
      createApartment,
      createApartmentFromLink,
      attachPdf,
      updateApartment,
      deleteApartment,
      rateApartment,
      retryEnrichment,
      processApartment,
      chargeReprocess,
      relocateApartment,
      createLocation,
      updateLocation,
      deleteLocation,
      moveLocation,
      runMaintenance,
      rotateDataKey,
      exportHousehold,
      readImport,
      importHousehold,
    }),
    [
      identity, limits, credits, memberNames, dataKey, status, error, apartments, locations, enrichmentError, reload,
      createApartment, createApartmentFromLink, attachPdf, updateApartment, deleteApartment, rateApartment, retryEnrichment,
      processApartment, chargeReprocess, relocateApartment,
      createLocation, updateLocation, deleteLocation, moveLocation, runMaintenance, rotateDataKey,
      exportHousehold, readImport, importHousehold,
    ]
  );

  return <HouseholdDataContext.Provider value={value}>{children}</HouseholdDataContext.Provider>;
}
