"use client";

import Link, { useLinkStatus } from "next/link";
import { ThemedLogo } from "@/components/themed-logo";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { clearKeys } from "@/lib/crypto";
import { clearShares } from "@/lib/share-stash";
import { cn } from "@/lib/utils";
import { getUnsavedRating } from "@/lib/unsaved-changes";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageMenu } from "@/components/language-menu";
import { BookOpen, ChevronDown, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// `key` names the label in the `nav` catalogue: `items.<key>` on the desktop
// bar, `short.<key>` on the phone's bottom bar, where six share 360px and a
// translation may need a shorter word (#288).
const navItems = [
  { href: "/apartments", key: "apartments" },
  { href: "/apartments/new", key: "upload" },
  { href: "/compare", key: "compare" },
  { href: "/map", key: "map" },
  { href: "/household", key: "household" },
  { href: "/settings", key: "settings" },
] as const;
// Guide lives in the user menu (#330): seven items did not fit the phone's
// bottom bar at 360px once Map was added.

// Marks the link that was just clicked while its page is on the way (#302).
// loading.tsx covers the page area; this covers the case where the loading
// state has not been prefetched yet, so the click still visibly registers.
// Only the opacity changes, so nothing shifts.
function NavLabel({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      data-pending={pending ? "" : undefined}
      className={cn("transition-opacity", pending && "animate-pulse opacity-60")}
    >
      {children}
    </span>
  );
}

export function NavBar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  async function handleSignOut() {
    if (getUnsavedRating()) {
      const ok = window.confirm(t("confirmSignOut"));
      if (!ok) return;
    }
    await clearKeys();
    await clearShares();
    await signOut({ callbackUrl: "/" });
  }

  return (
    <header className="border-b-3 border-frame bg-card print:hidden">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/apartments" className="flex min-h-11 items-center sm:min-h-0">
          <ThemedLogo width={120} height={37} className="h-8 w-auto" priority />
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={cn(
                "border-2 border-transparent px-3 py-1.5 text-sm font-bold transition-colors",
                pathname === item.href
                  ? "border-frame bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <NavLabel>{t(`items.${item.key}`)}</NavLabel>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <LanguageMenu signedIn />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-h-11 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:min-h-0">
              <User className="h-3.5 w-3.5" />
              <span>{userName}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
              <DropdownMenuItem render={<Link href="/guide" />}>
                <BookOpen className="h-3.5 w-3.5" />
                {t("menu.guide")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-3.5 w-3.5" />
                {t("menu.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t-3 border-frame bg-card sm:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center py-3 text-center text-xs transition-colors",
              pathname === item.href
                ? "bg-primary font-bold text-primary-foreground"
                : "text-muted-foreground"
            )}
          >
            <NavLabel>{t(`short.${item.key}`)}</NavLabel>
          </Link>
        ))}
      </nav>
    </header>
  );
}
