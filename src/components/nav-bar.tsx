"use client";

import { useState } from "react";
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
import { InstallHelpDialog } from "@/components/install/install-help-dialog";
import { promptInstall, useInstallState } from "@/components/install/install-prompt";
import {
  BookOpen,
  Building2,
  ChevronDown,
  Columns3,
  Download,
  FileText,
  LogOut,
  Map as MapIcon,
  Settings,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// `key` names the label in the `nav` catalogue: `items.<key>` on the desktop
// bar, `short.<key>` on the phone's bottom bar. The phone shows the icon
// only (#404); the short label is what a screen reader hears.
type NavKey = "apartments" | "upload" | "compare" | "map" | "household" | "settings";
const navItems: readonly { href: string; key: NavKey; icon: LucideIcon }[] = [
  { href: "/apartments", key: "apartments", icon: Building2 },
  { href: "/apartments/new", key: "upload", icon: Upload },
  { href: "/compare", key: "compare", icon: Columns3 },
  { href: "/map", key: "map", icon: MapIcon },
  { href: "/household", key: "household", icon: Users },
  { href: "/settings", key: "settings", icon: Settings },
];

const NAME_CHARS = 7;

/** The first seven characters of the name, then "...", so a long name cannot
 * push the nav bar onto two lines (#407). Counts characters, not UTF-16 units. */
export function shortName(name: string): string {
  const chars = Array.from(name.trim());
  return chars.length > NAME_CHARS ? `${chars.slice(0, NAME_CHARS).join("")}...` : chars.join("");
}
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

// `terms`: link the terms page (#474), only where an operator is configured.
export function NavBar({ userName, terms = false }: { userName: string; terms?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const install = useInstallState();
  // Outside the menu: the menu closes, and unmounts its items, on the click.
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

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
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-2 px-4 sm:h-14">
        <Link href="/apartments" className="flex min-h-11 shrink-0 items-center sm:min-h-0">
          <ThemedLogo width={120} height={37} className="h-7 w-auto sm:h-8" priority />
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
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <LanguageMenu signedIn />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger
              title={userName}
              className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span>{shortName(userName)}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
              <DropdownMenuItem render={<Link href="/guide" />}>
                <BookOpen className="h-3.5 w-3.5" />
                {t("menu.guide")}
              </DropdownMenuItem>
              {terms && (
                <DropdownMenuItem render={<Link href="/terms" />}>
                  <FileText className="h-3.5 w-3.5" />
                  {t("menu.terms")}
                </DropdownMenuItem>
              )}
              {/* Only where installing is possible and not done (#190). */}
              {(install === "prompt" || install === "ios") && (
                <DropdownMenuItem
                  onClick={() =>
                    install === "prompt" ? void promptInstall() : setInstallHelpOpen(true)
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("menu.install")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-3.5 w-3.5" />
                {t("menu.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <InstallHelpDialog open={installHelpOpen} onOpenChange={setInstallHelpOpen} />
        </div>
      </div>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t-3 border-frame bg-card sm:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            title={t(`short.${item.key}`)}
            className={cn(
              "flex h-12 flex-1 items-center justify-center transition-colors",
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            )}
          >
            <NavLabel>
              <item.icon className="size-5" aria-hidden />
              <span className="sr-only">{t(`short.${item.key}`)}</span>
            </NavLabel>
          </Link>
        ))}
      </nav>
    </header>
  );
}
