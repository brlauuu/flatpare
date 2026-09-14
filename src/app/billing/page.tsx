import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NavBar } from "@/components/nav-bar";
import { resolveHouseholdIdentity } from "@/lib/session";
import { readCreditBalance } from "@/lib/billing";
import { CheckoutPanel } from "./checkout-panel";

// Where a household that has never purchased lands (src/lib/billing-gate.ts).
//
// Deliberately outside the four signed-in layouts: those mount CryptoGate and
// the household data store, neither of which is needed to buy something, and
// one of which would gate this page behind unlocking a key the user may not
// have set up yet.
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await auth();
  const identity = await resolveHouseholdIdentity();
  if (!identity) redirect("/");

  const balance = await readCreditBalance(identity.householdId);
  // Nothing to sell: either billing is off (self-hosted) or they already own
  // credits. Either way this page has no purpose for them.
  if (!balance.enabled) redirect("/apartments");

  const returning = balance.granted > 0;

  return (
    <>
      <NavBar userName={session?.user?.name ?? "Unknown"} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {returning ? "Add 40 more apartments" : "One payment, then it's yours"}
          </h1>
          {returning ? (
            <p className="text-muted-foreground text-pretty">
              You have used {balance.used} of {balance.granted} apartments.
              Another CHF 5 adds 40 more.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-pretty">
                Flatpare is CHF 5, once — not a subscription. That covers up to
                10 people and 40 apartments in your household.
              </p>
              <p className="text-sm text-muted-foreground text-pretty">
                The 40 counts apartments you <strong>add</strong>, not
                apartments you keep: deleting one frees room in your comparison
                but does not give the credit back. Reading a PDF and measuring
                travel times costs us money per apartment, and that is what you
                are paying for.
              </p>
            </>
          )}
        </div>

        <CheckoutPanel />

        <p className="text-xs text-muted-foreground text-pretty">
          Payment is handled by Stripe. Flatpare never sees your card details,
          and Stripe never sees your apartments — they are encrypted in your
          browser.
        </p>
      </main>
    </>
  );
}
