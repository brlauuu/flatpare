import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { householdMembers } from "@/lib/db/schema";
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
    role: await currentRole(householdId, userId, session?.role ?? null),
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

// The role, read from the database (#192): an owner can promote or demote
// someone, and the session token is up to 24h old. Falls back to the
// session's role when the row cannot be read, and to "member" — the safe
// reading — when neither has one.
export async function currentRole(
  householdId: number,
  userId: string,
  sessionRole: "owner" | "member" | null
): Promise<"owner" | "member"> {
  const [row] = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
  return (row?.role as "owner" | "member" | undefined) ?? sessionRole ?? "member";
}
