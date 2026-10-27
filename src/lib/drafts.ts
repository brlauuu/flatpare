import { and, desc, asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartmentDrafts, users, type DraftRecord } from "@/lib/db/schema";
import { HouseholdError } from "@/lib/household";
import { MAX_DRAFTS } from "@/lib/draft-limit";

export { MAX_DRAFTS };
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

// The cap is one conditional INSERT ... SELECT ... WHERE (count) < max, as in
// createLocation: atomic without a transaction (#225). Costs no credit.
export async function createDraft(
  householdId: number,
  input: { id: string; createdBy: string; envelope: string }
): Promise<DraftRecord> {
  const result = await db.run(sql`
    INSERT INTO apartment_drafts (id, household_id, created_by, envelope)
    SELECT ${input.id}, ${householdId}, ${input.createdBy}, ${input.envelope}
    WHERE (
      SELECT COUNT(*) FROM apartment_drafts WHERE household_id = ${householdId}
    ) < ${MAX_DRAFTS}
  `);
  if (Number(result.rowsAffected ?? 0) === 0) {
    throw new HouseholdError("Too many drafts", 409);
  }
  const [created] = await db
    .select()
    .from(apartmentDrafts)
    .where(eq(apartmentDrafts.id, input.id))
    .limit(1);
  return created;
}

export async function deleteDraft(householdId: number, id: string): Promise<boolean> {
  const deleted = await db
    .delete(apartmentDrafts)
    .where(and(eq(apartmentDrafts.id, id), eq(apartmentDrafts.householdId, householdId)))
    .returning({ id: apartmentDrafts.id });
  return deleted.length > 0;
}
