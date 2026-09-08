import { auth } from "@/auth";
import { NavBar } from "@/components/nav-bar";
import { CryptoGate } from "@/components/crypto/crypto-gate";
import { HouseholdDataProvider } from "@/components/household-data/household-data-provider";
import { resolveHouseholdIdentity } from "@/lib/session";

export default async function ApartmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name ?? "Unknown";
  const identity = await resolveHouseholdIdentity();

  return (
    <>
      <NavBar userName={userName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-20 sm:pb-6">
        {identity ? (
          <CryptoGate>
            <HouseholdDataProvider identity={identity}>{children}</HouseholdDataProvider>
          </CryptoGate>
        ) : null}
      </main>
    </>
  );
}
