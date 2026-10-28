import { and, desc, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartmentDrafts, users, type DraftRecord } from "@/lib/db/schema";

// Drafts (#190) were links saved to add later. Since #413 a link becomes an
// unprocessed apartment instead, so nothing creates a draft any more; the
// store lists the ones left, turns each into an apartment and deletes it.
export type { DraftRecord };

export type DraftWithCreator = DraftRecord & {
  creatorName: string | null;
  creatorEmail: string | null;
};

export async function listDrafts(householdId: number): Promise<DraftWithCreator[]> {
  const rows = await db
    .select({
      draft: apartmentDrafts,
      creatorName: users.name,
      creatorEmail: users.email,
    })
    .from(apartmentDrafts)
    .leftJoin(users, eq(users.id, apartmentDrafts.createdBy))
    .where(eq(apartmentDrafts.householdId, householdId))
    .orderBy(desc(apartmentDrafts.createdAt), asc(apartmentDrafts.id));
  return rows.map((r) => ({
    ...r.draft,
    creatorName: r.creatorName,
    creatorEmail: r.creatorEmail,
  }));
}

export async function deleteDraft(householdId: number, id: string): Promise<boolean> {
  const deleted = await db
    .delete(apartmentDrafts)
    .where(and(eq(apartmentDrafts.id, id), eq(apartmentDrafts.householdId, householdId)))
    .returning({ id: apartmentDrafts.id });
  return deleted.length > 0;
}
