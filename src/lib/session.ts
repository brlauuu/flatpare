import { auth } from "@/auth";
import { UnauthorizedError, type Role } from "@/lib/household";

export async function requireHousehold(): Promise<{
  householdId: number;
  userId: string;
  role: Role;
}> {
  const session = await auth();
  const userId = session?.user?.id;
  const householdId = session?.householdId;
  const role = session?.role;

  if (!userId || !householdId || !role) throw new UnauthorizedError();

  return { householdId, userId, role };
}

// Identity for the client-side household data store (HouseholdDataProvider),
// not gated on `role` the way requireHousehold is — the four signed-in
// layouts pass this straight through as a prop. Returns null exactly when
// the caller has no authenticated household, mirroring the old CryptoGate's
// early-return-null behavior; kept out of src/components so nothing under
// src/components/crypto has to import from src/components/household-data.
export async function resolveHouseholdIdentity(): Promise<{
  userId: string;
  householdId: number;
  userName: string;
} | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const householdId = session?.householdId;
  if (!userId || !householdId) return null;

  return {
    userId,
    householdId,
    userName: session?.user?.name ?? "Member",
  };
}
