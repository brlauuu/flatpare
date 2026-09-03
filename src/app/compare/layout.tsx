import { auth } from "@/auth";
import { NavBar } from "@/components/nav-bar";

export default async function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name ?? "Unknown";

  return (
    <>
      <NavBar userName={userName} />
      <main className="flex-1 px-4 py-6 pb-20 sm:pb-6">{children}</main>
    </>
  );
}
