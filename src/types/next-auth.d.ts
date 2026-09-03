import "next-auth";

declare module "next-auth" {
  interface Session {
    householdId: number;
    role: "owner" | "member";
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
