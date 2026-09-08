import { auth } from "@/auth";
import { HouseholdDataProvider } from "@/components/household-data/household-data-provider";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { CryptoProvider } from "./crypto-provider";

// Server component: reads the env var once per request so no env access
// ships to the client, and hands the session identity to the data store.
// CryptoProvider renders its own screens instead of children until the key
// is usable, so HouseholdDataProvider only ever mounts with a key (or with
// encryption off). The proxy guarantees a session with a household here.
export async function CryptoGate({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;
  const householdId = session?.householdId;
  if (!userId || !householdId) return null;
  const identity = {
    userId,
    householdId,
    userName: session?.user?.name ?? "Member",
  };
  return (
    <CryptoProvider mode={readEncryptionMode()}>
      <HouseholdDataProvider identity={identity}>{children}</HouseholdDataProvider>
    </CryptoProvider>
  );
}
