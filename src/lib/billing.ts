import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartmentCharges, creditSpends, households, payments } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { isUniqueConstraintError } from "@/lib/unique-constraint";

// E6 apartment credits.
//
// A credit is spent by PROCESSING an apartment (#413), not by adding or
// holding one: processing is what costs real money (an AI extraction, a
// geocode, two distance elements per saved location), while an apartment
// someone rated and described by hand costs a few hundred bytes of
// ciphertext. The first processing of each apartment — reading its PDF or
// geocoding its address, whichever comes first — spends one credit; a
// reprocess and a "recompute all" spend one each, by explicit request.
// Deleting an apartment frees a slot against MAX_APARTMENTS but does not
// refund the credit, and the landing page says so in as many words.
//
// This is separate from E5's cap, which counts CURRENT rows. Both apply:
//   - MAX_APARTMENTS  — how many you may hold at once (E5)
//   - credits         — how many processings you may ever pay for (E6)
//
// The counter is still called apartments_ever_added; since #413 it counts
// credits spent, which is what it always counted.

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

// What a spent credit paid for, recorded in credit_spends (#413).
export type CreditSpendKind = "first" | "reprocess" | "recompute";

// Consumes exactly one credit, atomically, and records what it paid for.
// Returns false when the household has none left.
//
// A single guarded UPDATE rather than a read-then-write: two concurrent adds
// at 39 of 40 would otherwise both see room and both proceed, overspending
// the quota. Deliberately NOT wrapped in db.transaction — parallel
// transactions on libSQL abort with SQLITE_BUSY (#225), and one statement
// needs no transaction anyway.
export async function consumeApartmentCredit(
  householdId: number,
  kind: CreditSpendKind
): Promise<boolean> {
  if (!billingEnabled()) return true;

  const result = await db.run(sql`
    UPDATE households
       SET apartments_ever_added = apartments_ever_added + 1
     WHERE id = ${householdId}
       AND apartments_ever_added < apartment_credits_granted
  `);
  if (Number(result.rowsAffected ?? 0) === 0) return false;
  // A second statement, not a transaction (#225): the log is for the host's
  // own cross-checks, and a crash between the two leaves it one row short,
  // never the customer.
  await db.insert(creditSpends).values({ householdId, kind });
  return true;
}

function noCredits(): ApiError {
  return new ApiError("No apartment credits left", 402);
}

// Records the apartment as charged. True when this call wrote the row, false
// when it was already there.
async function markCharged(householdId: number, apartmentId: string): Promise<boolean> {
  const result = await db.run(sql`
    INSERT INTO apartment_charges (household_id, apartment_id)
    VALUES (${householdId}, ${apartmentId})
    ON CONFLICT DO NOTHING
  `);
  return Number(result.rowsAffected ?? 0) > 0;
}

async function unmarkCharged(householdId: number, apartmentId: string): Promise<void> {
  await db
    .delete(apartmentCharges)
    .where(
      and(
        eq(apartmentCharges.householdId, householdId),
        eq(apartmentCharges.apartmentId, apartmentId)
      )
    );
}

// The first processing of an apartment (#413): free when this apartment id
// was charged before, otherwise one credit. Called by the process routes for
// every request that names an apartment, before the outbound call.
//
// Record first, then spend — the stamp-then-grant order of
// grantBetaPassCredits. The insert is the claim: of two concurrent first
// calls exactly one writes the row and spends, the other finds it and goes
// through free. When the credit cannot be spent the claim is taken back.
// Spending first instead refused concurrent calls for the same apartment
// whenever the household had fewer credits than calls in flight. Each step
// is one statement, not a transaction (#225).
export async function chargeFirstProcessing(
  householdId: number,
  apartmentId: string
): Promise<void> {
  if (!billingEnabled()) return;
  if (!(await markCharged(householdId, apartmentId))) return;
  if (await consumeApartmentCredit(householdId, "first")) return;
  await unmarkCharged(householdId, apartmentId);
  throw noCredits();
}

// A reprocess, asked for explicitly: always one credit. Also records the
// apartment as charged, so the calls the reprocess then makes are free even
// for an apartment that was never charged (an imported one).
export async function chargeReprocess(
  householdId: number,
  apartmentId: string
): Promise<void> {
  if (!billingEnabled()) return;
  if (!(await consumeApartmentCredit(householdId, "reprocess"))) throw noCredits();
  await markCharged(householdId, apartmentId);
}

// "Recompute all" on the Household page: one credit for the whole run,
// however many apartments it measures (decided on #413).
export async function chargeRecompute(householdId: number): Promise<void> {
  if (!billingEnabled()) return;
  if (!(await consumeApartmentCredit(householdId, "recompute"))) throw noCredits();
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

export interface RecordedPayment {
  eventId: string;
  householdId: number;
  stripeCustomer: string | null;
  stripeSession: string | null;
  amountCents: number;
  currency: string;
  credits: number;
}

// Records a payment and grants its credits, exactly once.
//
// Returns false when this Stripe event was already processed. Stripe delivers
// webhooks AT LEAST ONCE — a retry after a slow response is normal — so a
// redelivery must not grant a second 40 credits. The `payments` primary key
// is the Stripe event id, which makes the insert itself the deduplication:
// if it conflicts, we have seen this event before and stop.
//
// The insert happens BEFORE the grant on purpose. If the process dies between
// the two, the customer is short 40 credits and the ledger says so, which is
// visible and fixable. The other order risks granting twice on a retry, which
// is silent and costs money.
export async function recordPaymentOnce(p: RecordedPayment): Promise<boolean> {
  try {
    await db.insert(payments).values({
      id: p.eventId,
      householdId: p.householdId,
      stripeCustomer: p.stripeCustomer,
      stripeSession: p.stripeSession,
      amountCents: p.amountCents,
      currency: p.currency,
      creditsGranted: p.credits,
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) return false; // already processed
    throw err;
  }

  await grantApartmentCredits(p.householdId, p.credits);
  return true;
}
