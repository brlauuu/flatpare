import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, type ApartmentRecord } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { isUniqueConstraintError } from "@/lib/unique-constraint";
import { readLimits } from "@/lib/limits";
import {
  billingEnabled,
  consumeApartmentCredit,
  refundApartmentCredit,
} from "@/lib/billing";

// Creates one apartment row, enforcing MAX_APARTMENTS (E5).
//
// The cap is applied by a conditional INSERT ... SELECT ... WHERE (count) <
// max rather than by counting first and inserting second. One statement is
// atomic, so two concurrent creates at 19 of 20 cannot both see 19 and both
// insert — and unlike a read-then-write inside `db.transaction`, it does not
// need concurrent transactions on the libSQL connection, which fail with
// SQLITE_BUSY ("cannot commit transaction — SQL statements in progress").
// `createLocation` uses the transaction form for MAX_LOCATIONS; it has no
// concurrency test, and the same rewrite would suit it.
//
// Counting needs no decryption — `envelope` is never opened here.
export async function createApartmentRow(
  householdId: number,
  input: { id: string; envelope: string }
): Promise<ApartmentRecord> {
  const { maxApartments } = readLimits();

  // E6: spend a credit BEFORE inserting, so two concurrent adds at the last
  // credit cannot both proceed. No-op when billing is off (self-hosting).
  // Refunded below if the insert then fails, so a duplicate id or the
  // active-row cap does not silently burn a credit the customer paid for.
  if (!(await consumeApartmentCredit(householdId))) {
    throw new ApiError("No apartment credits left", 402);
  }

  let inserted = false;
  try {
    if (maxApartments === null) {
      const [created] = await db
        .insert(apartments)
        .values({ id: input.id, householdId, envelope: input.envelope })
        .returning();
      inserted = true;
      return created;
    }

    const result = await db.run(sql`
      INSERT INTO apartments (id, household_id, envelope)
      SELECT ${input.id}, ${householdId}, ${input.envelope}
      WHERE (
        SELECT COUNT(*) FROM apartments WHERE household_id = ${householdId}
      ) < ${maxApartments}
    `);

    // No row inserted means the WHERE was false — the household is at its
    // cap. A duplicate id would have thrown instead, and is handled below.
    if (Number(result.rowsAffected ?? 0) === 0) {
      throw new ApiError("Apartment limit reached", 409);
    }

    // Read back through Drizzle so the caller gets a properly typed record
    // (timestamps as Dates) rather than raw libSQL column values.
    const [created] = await db
      .select()
      .from(apartments)
      .where(eq(apartments.id, input.id))
      .limit(1);
    inserted = true;
    return created;
  } catch (err) {
    // A duplicate id must keep its own message — the client distinguishes a
    // retryable id clash from a hard entitlement refusal.
    if (isUniqueConstraintError(err)) throw new ApiError("Duplicate id", 409);
    throw err;
  } finally {
    // Every path that did not produce a row gives the credit back: the
    // active-row cap, a duplicate id, or an unexpected failure.
    if (!inserted && billingEnabled()) await refundApartmentCredit(householdId);
  }
}
