// Drafts (#190) were links saved to add later. Since #413 a link becomes an
// unprocessed apartment straight away, which costs nothing either, so no new
// draft is made; the ones left are turned into apartments when the store
// loads (adoptDrafts). Kept out of the provider.
import { openDraft } from "@/lib/household-data/codec";
import { apartmentFromLink } from "@/lib/household-data/links";
import type { Apartment, DecodedDraft } from "@/lib/household-data/types";
import type { DraftRow } from "@/lib/household-data/wire";
import { ApiClientError, getJson, sendJson } from "./api-client";

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

export async function removeDraft(id: string): Promise<void> {
  await sendJson<void>("DELETE", `/api/drafts/${id}`);
}

// Turns each draft into an unprocessed apartment with the same id, added by
// whoever saved the draft (#430), then deletes the draft. A 409 "Duplicate id" means another device (or an earlier
// load whose delete failed) already made the apartment: the draft just goes.
// Any other failure, the apartment cap included, leaves the draft for the
// next load. A draft that cannot be opened stays as it is: nothing can be
// made from it, and rotation still re-seals it.
export async function adoptDrafts(
  drafts: DecodedDraft[],
  create: (id: string, data: Apartment, addedBy: string | null) => Promise<unknown>
): Promise<number> {
  let adopted = 0;
  for (const d of drafts) {
    if (d.data === null) continue;
    try {
      await create(d.id, apartmentFromLink(d.data.url, d.data.title), d.createdBy);
      adopted += 1;
    } catch (err) {
      if (!(err instanceof ApiClientError && err.status === 409 && err.message === "Duplicate id")) continue;
    }
    try {
      await removeDraft(d.id);
    } catch {
      // The apartment exists; the next load finds the draft, gets "Duplicate
      // id" and deletes it then.
    }
  }
  return adopted;
}
