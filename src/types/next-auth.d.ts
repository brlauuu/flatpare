import "next-auth";

declare module "next-auth" {
  interface Session {
    // null while the user has no household yet (a pending invitation is
    // waiting for them) — see src/lib/household.ts resolveHouseholdForUser.
    householdId: number | null;
    role: "owner" | "member" | null;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
