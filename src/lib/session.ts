import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { displayName } from "@/lib/display-name";
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
  role: "owner" | "member";
} | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const householdId = session?.householdId;
  if (!userId || !householdId) return null;

  return {
    userId,
    householdId,
    userName: await currentDisplayName(userId, session?.user?.name ?? null),
    // A session with a household but no role should not exist (the jwt
    // callback stamps both); "member" is the safe reading if it ever does.
    role: session?.role ?? "member",
  };
}

// The signed-in person's display name, read from the database (#327): the
// session token is up to 24h old, so a name just changed on Settings would
// otherwise not show. The session's name is only a fallback for a row that
// cannot be read.
export async function currentDisplayName(userId: string, sessionName: string | null): Promise<string> {
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (row) return displayName(row.name, row.email);
  return sessionName ?? "Member";
}
