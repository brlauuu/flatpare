import { auth } from "@/auth";
import { NavBar } from "@/components/nav-bar";
import { CryptoGate } from "@/components/crypto/crypto-gate";
import { HouseholdDataProvider } from "@/components/household-data/household-data-provider";
import { resolveHouseholdIdentity } from "@/lib/session";
import { readLimits } from "@/lib/limits";
import { requirePurchase } from "@/lib/billing-gate";

// The one layout for every signed-in section (#302). `(app)` is a route
// group, so it adds nothing to the URL.
//
// It used to be four near-identical layouts, one per section. Moving between
// sections therefore crossed a layout boundary every time: the click waited
// on this function's awaits with nothing on screen, and then the nav bar,
// CryptoProvider and HouseholdDataProvider all remounted, re-reading the key
// store and re-downloading and re-decrypting every row. Sharing the layout
// keeps all three mounted, so a section switch only swaps the page.
//
// Next.js does not re-render a shared layout on client navigation, so the
// awaits below run on a full page load only. That is sufficient: the proxy
// still authenticates every request, and every data route re-checks
// membership itself.
export default async function AppLayout({
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
      {/* Width is set per section (see section-width.tsx): compare is a wide
          table and takes the full window, the rest are capped. */}
      <main className="flex-1 px-4 py-6 pb-20 sm:pb-6">
        {identity ? (
          <CryptoGate>
            <HouseholdDataProvider identity={identity} limits={limits}>{children}</HouseholdDataProvider>
          </CryptoGate>
        ) : null}
      </main>
    </>
  );
}
