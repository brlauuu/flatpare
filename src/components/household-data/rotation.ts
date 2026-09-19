import {
  DEFAULT_KDF_PARAMS,
  generateDataKey,
  importPublicKey,
  saveKeys,
  toStoredDataKey,
  wrapDataKey,
  type KdfParams,
  type StoredKeys,
} from "@/lib/crypto";
import {
  FlowError,
  api,
  makeRecoveryKit,
  post,
  type StatusResponse,
} from "@/components/crypto/flows";
import {
  openApartment,
  openLocation,
  openRating,
  sealApartment,
  sealLocation,
  sealRating,
} from "@/lib/household-data/codec";
import type { ApartmentPdf } from "@/lib/household-data/types";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";
import type { Envelope } from "@/lib/crypto";
import { ApiClientError, getJson } from "./api-client";
import { downloadPdf, encryptAndUploadPdf } from "./pdf-files";

// Data-key rotation (#219): the owner's browser generates a new household
// key, re-seals every row and every PDF under it, wraps it to every member
// who has a public key, mints a new recovery kit, and commits the lot in
// one request. Design: docs/superpowers/specs/2026-09-19-key-rotation-design.md.
//
// Lives beside the household store rather than in src/components/crypto
// because it needs the codec and the PDF helpers; it borrows the crypto
// flows' fetch and kit helpers instead of duplicating them. Nothing here
// touches crypto.subtle directly — that stays under src/lib/crypto.

export interface RotationReport {
  keyVersion: number;
  rows: number;
  pdfs: number;
  // Apartment ids whose PDF could not be fetched and re-encrypted. Their
  // envelope keeps the old reference; the rotation still went through.
  pdfFailures: string[];
}

export interface RotationOptions {
  kdfParams?: KdfParams;
}

interface Targets {
  keyVersion: number;
  members: { userId: string; publicKey: string }[];
}

interface RotatePayload {
  fromKeyVersion: number;
  wraps: { userId: string; wrappedKey: string; publicKey: string }[];
  recovery: { wrappedKey: string; iv: string; kdf: KdfParams & { salt: string } };
  apartments: { id: string; version: number; envelope: Envelope | null }[];
  ratings: { apartmentId: string; userId: string; envelope: Envelope | null }[];
  locations: { id: string; envelope: Envelope | null }[];
  retiredPdfPaths: string[];
}

function isStaleRows(err: unknown): boolean {
  return err instanceof FlowError && err.message === "Stale rows";
}

export async function runRotateDataKey(
  status: StatusResponse,
  keys: StoredKeys,
  opts: RotationOptions = {}
): Promise<{ recoveryCode: string; report: RotationReport }> {
  const params = opts.kdfParams ?? DEFAULT_KDF_PARAMS;
  if (status.role !== "owner") {
    throw new FlowError("Only the owner can rotate the household key", "state");
  }
  const oldKey = keys.dataKey;
  if (!oldKey) throw new FlowError("You do not hold the household key", "state");

  const targets = await api<Targets>("/api/crypto/rotate");
  const from = targets.keyVersion;
  if ((keys.keyVersion ?? 1) !== from) {
    throw new FlowError(
      "This device holds an older household key; refresh and try again",
      "state"
    );
  }
  const next = from + 1;
  const householdId = status.householdId;

  // The new key is extractable only for as long as it takes to wrap it;
  // what gets persisted is the non-extractable copy.
  const newKey = await generateDataKey();
  const kit = await makeRecoveryKit(newKey, params);
  const wraps: RotatePayload["wraps"] = [];
  for (const m of targets.members) {
    wraps.push({
      userId: m.userId,
      wrappedKey: await wrapDataKey(newKey, await importPublicKey(m.publicKey)),
      publicKey: m.publicKey,
    });
  }

  // PDF re-encryption is done once per apartment and remembered across a
  // retry: the upload is idempotent (same versioned path) but not free.
  const uploadedPdf = new Map<string, ApartmentPdf>();
  const retired = new Set<string>();
  const pdfFailures = new Set<string>();

  const prepare = async (): Promise<{ payload: RotatePayload; rows: number; pdfs: number }> => {
    const [aRows, rRows, lRows] = await Promise.all([
      getJson<ApartmentRow[]>("/api/apartments"),
      getJson<RatingRow[]>("/api/ratings"),
      getJson<LocationRow[]>("/api/locations"),
    ]);
    let rows = 0;

    const apartments = [];
    for (const row of aRows) {
      const data = await openApartment(oldKey, householdId, row.id, row.envelope);
      if (data === null) {
        apartments.push({ id: row.id, version: row.version, envelope: null });
        continue;
      }
      let pdf = data.pdf;
      if (pdf) {
        const done = uploadedPdf.get(row.id);
        if (done) {
          pdf = done;
        } else if (!pdfFailures.has(row.id)) {
          try {
            const bytes = await downloadPdf(oldKey, householdId, row.id, pdf);
            const fresh = await encryptAndUploadPdf(newKey, householdId, row.id, bytes, next);
            uploadedPdf.set(row.id, fresh);
            retired.add(pdf.path);
            pdf = fresh;
          } catch {
            pdfFailures.add(row.id);
          }
        }
      }
      const envelope = await sealApartment(newKey, householdId, row.id, { ...data, pdf }, next);
      apartments.push({ id: row.id, version: row.version, envelope });
      rows++;
    }

    const ratings = [];
    for (const row of rRows) {
      const data = await openRating(oldKey, householdId, row.apartmentId, row.userId, row.envelope);
      const envelope =
        data === null
          ? null
          : await sealRating(newKey, householdId, row.apartmentId, row.userId, data, next);
      if (envelope) rows++;
      ratings.push({ apartmentId: row.apartmentId, userId: row.userId, envelope });
    }

    const locations = [];
    for (const row of lRows) {
      const data = await openLocation(oldKey, householdId, row.id, row.envelope);
      const envelope = data === null ? null : await sealLocation(newKey, householdId, row.id, data, next);
      if (envelope) rows++;
      locations.push({ id: row.id, envelope });
    }

    return {
      payload: {
        fromKeyVersion: from,
        wraps,
        recovery: kit.recovery,
        apartments,
        ratings,
        locations,
        retiredPdfPaths: [...retired],
      },
      rows,
      pdfs: uploadedPdf.size,
    };
  };

  let prepared = await prepare();
  let result: { keyVersion: number };
  try {
    result = await post<{ keyVersion: number }>("/api/crypto/rotate", prepared.payload);
  } catch (err) {
    // A concurrent write moved a row under us. Re-read, re-seal, try once
    // more; the PDFs already uploaded are reused by apartment id.
    if (!isStaleRows(err)) throw err;
    prepared = await prepare();
    result = await post<{ keyVersion: number }>("/api/crypto/rotate", prepared.payload);
  }

  await saveKeys({
    ...keys,
    dataKey: await toStoredDataKey(newKey),
    keyVersion: result.keyVersion,
  });

  return {
    recoveryCode: kit.code,
    report: {
      keyVersion: result.keyVersion,
      rows: prepared.rows,
      pdfs: prepared.pdfs,
      pdfFailures: [...pdfFailures],
    },
  };
}

// True for the write refusal a rotated household answers with; the store
// refreshes the crypto status (which adopts the new wrap) and asks the
// caller to try again.
export function isStaleKey(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && err.status === 409 && err.message === "Stale key";
}
