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
