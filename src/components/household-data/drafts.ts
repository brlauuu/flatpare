// Fetch + codec work for drafts (#190), kept out of the provider.
import { openDraft, sealDraft } from "@/lib/household-data/codec";
import type { Draft, DecodedDraft, DraftView } from "@/lib/household-data/types";
import type { DraftRow } from "@/lib/household-data/wire";
import { getJson, sendJson } from "./api-client";

async function decodeDraft(key: CryptoKey | null, householdId: number, row: DraftRow): Promise<DecodedDraft> {
  const data = await openDraft(key, householdId, row.id, row.envelope);
  if (data === null) console.error(`[household-data] draft ${row.id} could not be opened`);
  return {
    id: row.id,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    data,
  };
}

export async function fetchDrafts(key: CryptoKey | null, householdId: number): Promise<DecodedDraft[]> {
  const rows = await getJson<DraftRow[]>("/api/drafts");
  return Promise.all(rows.map((row) => decodeDraft(key, householdId, row)));
}

type Send = <T>(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown) => Promise<T>;

export async function postDraft(
  send: Send,
  key: CryptoKey | null,
  householdId: number,
  keyVersion: number,
  id: string,
  data: Draft
): Promise<DecodedDraft> {
  const envelope = await sealDraft(key, householdId, id, data, keyVersion);
  const saved = await send<DraftRow>("POST", "/api/drafts", { id, envelope });
  return { id: saved.id, createdBy: saved.createdBy, createdByName: saved.createdByName, createdAt: saved.createdAt, data };
}

export async function removeDraft(id: string): Promise<void> {
  await sendJson<void>("DELETE", `/api/drafts/${id}`);
}

export function viewOfDraft(d: DecodedDraft): DraftView {
  return {
    id: d.id,
    corrupt: d.data === null,
    url: d.data?.url ?? null,
    title: d.data?.title ?? null,
    createdBy: d.createdBy,
    createdByName: d.createdByName,
    createdAt: d.createdAt,
  };
}
