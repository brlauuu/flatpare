import { redirect } from "next/navigation";
import { readCreditBalance } from "@/lib/billing";

// Sends a household that has never purchased to /billing before it sees the
// app. Called from the four signed-in layouts.
//
// Gated on `granted === 0` — NEVER on `remaining === 0`. The difference
// matters more than it looks:
//
//   granted === 0   never bought, so cannot have added anything, so has no
//                   data to be kept from. Safe to gate.
//   remaining === 0 bought before and used the credits. This household OWNS
//                   apartments. Gating it would lock a paying customer out of
//                   their own search — and under E2EE we could not retrieve
//                   that data for them even if asked. Running out of credits
//                   must only mean "no new apartments", never "no access".
//
// A self-hosted deployment has billing off, so this never fires.
export async function requirePurchase(householdId: number): Promise<void> {
  const balance = await readCreditBalance(householdId);
  if (balance.enabled && balance.granted === 0) redirect("/billing");
}
