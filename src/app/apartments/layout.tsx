import { auth } from "@/auth";
import { NavBar } from "@/components/nav-bar";
import { CryptoGate } from "@/components/crypto/crypto-gate";
import { HouseholdDataProvider } from "@/components/household-data/household-data-provider";
import { resolveHouseholdIdentity } from "@/lib/session";
import { readLimits } from "@/lib/limits";
import { requirePurchase } from "@/lib/billing-gate";

export default async function ApartmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name ?? "Unknown";
  const identity = await resolveHouseholdIdentity();
  // Read here, in a server component: MAX_MEMBERS / MAX_APARTMENTS must
  // never be read from a "use client" file.
  const limits = readLimits();
  // A household that has never purchased goes to /billing before it sees
  // the app. No-op when billing is off (self-hosted), and never fires for
  // a household that has merely run out of credits — see billing-gate.ts.
  if (identity) await requirePurchase(identity.householdId);

  return (
    <>
      <NavBar userName={userName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-20 sm:pb-6">
        {identity ? (
          <CryptoGate>
            <HouseholdDataProvider identity={identity} limits={limits}>{children}</HouseholdDataProvider>
          </CryptoGate>
        ) : null}
      </main>
    </>
  );
}
