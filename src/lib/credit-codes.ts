import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creditCodeRedemptions, creditCodes, type CreditCode } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { grantApartmentCredits } from "@/lib/billing";

// Credit codes (#492): a code from the operator adds credits to the household
// that redeems it. While credits are counted without Stripe this is how a
// beta tester who ran out gets more; after launch it can stay for gifts or
// for making up for a failed reading.
//
// The beta pass pattern: a guarded UPDATE consumes a use, the redemption row
// is the per-household claim, and the credits are granted last. Revoking a
// code stops it; nothing it granted is taken back.

// The same shape as a beta pass code: 32 hex characters, 122 bits from a v4
// UUID, so guessing one is not a way to free credits.
export function newCreditCode(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// What a person types or pastes: spaces, dashes and capitals are forgiven.
export function normalizeCreditCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toLowerCase();
}

export interface CreateCreditCodeInput {
  credits: number;
  label?: string | null;
  maxUses?: number | null;
  expiresAt?: Date | null;
}

export async function createCreditCode(input: CreateCreditCodeInput): Promise<CreditCode> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new Error("Credits must be a positive integer");
  }
  const [row] = await db
    .insert(creditCodes)
    .values({
      code: newCreditCode(),
      label: input.label ?? null,
      credits: input.credits,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row;
}

export async function revokeCreditCode(code: string): Promise<boolean> {
  const rows = await db
    .update(creditCodes)
    .set({ revokedAt: new Date() })
    .where(and(eq(creditCodes.code, normalizeCreditCode(code)), isNull(creditCodes.revokedAt)))
    .returning({ id: creditCodes.id });
  return rows.length > 0;
}

// Fixed messages: neither echoes the code (#492), and "not valid" does not
// say whether a code exists, was revoked, expired or ran out.
export const CODE_NOT_VALID = "That code is not valid.";
export const CODE_ALREADY_USED = "Your household has already used this code.";

async function claim(codeId: number, householdId: number): Promise<boolean> {
  const result = await db.run(sql`
    INSERT INTO credit_code_redemptions (code_id, household_id)
    VALUES (${codeId}, ${householdId})
    ON CONFLICT DO NOTHING
  `);
  return Number(result.rowsAffected ?? 0) > 0;
}

async function unclaim(codeId: number, householdId: number): Promise<void> {
  await db
    .delete(creditCodeRedemptions)
    .where(and(eq(creditCodeRedemptions.codeId, codeId), eq(creditCodeRedemptions.householdId, householdId)));
}

// One guarded statement: two households taking the last use of a one-use
// code at once cannot both get it. Not a db.transaction (#225).
async function consumeUse(codeId: number): Promise<boolean> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rows = await db
    .update(creditCodes)
    .set({ uses: sql`${creditCodes.uses} + 1` })
    .where(
      and(
        eq(creditCodes.id, codeId),
        isNull(creditCodes.revokedAt),
        sql`(${creditCodes.expiresAt} IS NULL OR ${creditCodes.expiresAt} > ${nowSeconds})`,
        sql`(${creditCodes.maxUses} IS NULL OR ${creditCodes.uses} < ${creditCodes.maxUses})`
      )
    )
    .returning({ id: creditCodes.id });
  return rows.length > 0;
}

// Redeems a code for a household and returns the credits it added.
//
// Claim, then use, then grant — each one statement, none a transaction
// (#225). The claim makes a second redemption by the same household a no-op
// however many requests race; a claim whose use cannot be consumed (revoked,
// expired, exhausted) is taken back, so a later valid attempt is not blocked.
// Dying after the use but before the grant leaves a household short and the
// record says so, never credits granted twice.
export async function redeemCreditCode(householdId: number, rawCode: string): Promise<number> {
  const code = normalizeCreditCode(rawCode);
  if (!/^[0-9a-f]{32}$/.test(code)) throw new ApiError(CODE_NOT_VALID, 400);

  const [row] = await db
    .select({ id: creditCodes.id, credits: creditCodes.credits })
    .from(creditCodes)
    .where(eq(creditCodes.code, code))
    .limit(1);
  if (!row) throw new ApiError(CODE_NOT_VALID, 400);

  if (!(await claim(row.id, householdId))) throw new ApiError(CODE_ALREADY_USED, 409);
  if (!(await consumeUse(row.id))) {
    await unclaim(row.id, householdId);
    throw new ApiError(CODE_NOT_VALID, 400);
  }
  await grantApartmentCredits(householdId, row.credits);
  return row.credits;
}
