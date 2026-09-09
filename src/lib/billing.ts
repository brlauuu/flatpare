import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";

// E6 apartment credits.
//
// A credit is spent by ADDING an apartment, not by holding one: adding is what
// costs real money (a Gemini extraction, a geocode, two distance elements per
// saved location), while holding costs a few hundred bytes of ciphertext.
// Deleting an apartment frees a slot against MAX_APARTMENTS but does not
// refund the credit, and the landing page says so in as many words.
//
// This is separate from E5's cap, which counts CURRENT rows. Both apply:
//   - MAX_APARTMENTS  — how many you may hold at once (E5)
//   - credits         — how many you may ever add (E6)

// One $5 purchase.
export const CREDITS_PER_PURCHASE = 40;

// Billing is off unless Stripe is configured, following the same rule as
// every other ceiling in this app: unset means unlimited. A self-hoster runs
// with their own API keys and must never be told to buy anything, nor have an
// apartment refused by a quota that cannot be topped up.
//
// Gated on the secret key rather than a separate flag on purpose: if the
// deployment cannot take money, it has no business enforcing a paywall.
export function billingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

export interface CreditBalance {
  granted: number;
  used: number;
  remaining: number;
  // null when billing is off — "unlimited", not "zero".
  enabled: boolean;
}

export async function readCreditBalance(
  householdId: number
): Promise<CreditBalance> {
  const [row] = await db
    .select({
      granted: households.apartmentCreditsGranted,
      used: households.apartmentsEverAdded,
    })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);

  const granted = row?.granted ?? 0;
  const used = row?.used ?? 0;
  return {
    granted,
    used,
    remaining: Math.max(0, granted - used),
    enabled: billingEnabled(),
  };
}

// Consumes exactly one credit, atomically. Returns false when the household
// has none left.
//
// A single guarded UPDATE rather than a read-then-write: two concurrent adds
// at 39 of 40 would otherwise both see room and both proceed, overspending
// the quota. Deliberately NOT wrapped in db.transaction — parallel
// transactions on libSQL abort with SQLITE_BUSY (#225), and one statement
// needs no transaction anyway.
export async function consumeApartmentCredit(
  householdId: number
): Promise<boolean> {
  if (!billingEnabled()) return true;

  const result = await db.run(sql`
    UPDATE households
       SET apartments_ever_added = apartments_ever_added + 1
     WHERE id = ${householdId}
       AND apartments_ever_added < apartment_credits_granted
  `);
  return Number(result.rowsAffected ?? 0) > 0;
}

// Puts a consumed credit back. Used only to compensate when the insert that
// the credit was consumed for then fails — a duplicate id, or the active-row
// cap. Without it a failed create would silently burn a credit the customer
// paid for.
//
// Guarded so it can never drive the counter below zero, which would hand out
// free credits if it were ever called spuriously.
export async function refundApartmentCredit(householdId: number): Promise<void> {
  if (!billingEnabled()) return;

  await db.run(sql`
    UPDATE households
       SET apartments_ever_added = apartments_ever_added - 1
     WHERE id = ${householdId}
       AND apartments_ever_added > 0
  `);
}

// Adds credits to a household. The webhook will be the only caller in
// production — never a client, and never the redirect back from Checkout.
export async function grantApartmentCredits(
  householdId: number,
  credits: number
): Promise<void> {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new ApiError("Credits must be a positive integer", 400);
  }
  await db
    .update(households)
    .set({
      apartmentCreditsGranted: sql`${households.apartmentCreditsGranted} + ${credits}`,
    })
    .where(and(eq(households.id, householdId)));
}
