import { cookies } from "next/headers";
import { NavBar } from "@/components/nav-bar";

export default async function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const userName = cookieStore.get("flatpare-name")?.value ?? "Unknown";

  return (
    <>
      <NavBar userName={userName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-20 sm:pb-6">
        {children}
      </main>
    </>
  );
}
