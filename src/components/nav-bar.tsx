"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { getUnsavedRating } from "@/lib/unsaved-changes";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChevronDown, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/apartments", label: "Apartments" },
  { href: "/apartments/new", label: "Upload" },
  { href: "/compare", label: "Compare" },
  { href: "/costs", label: "Costs" },
  { href: "/settings", label: "Settings" },
  { href: "/guide", label: "Guide" },
];

export function NavBar({ userName }: { userName: string }) {
  const pathname = usePathname();

  async function handleSignOut() {
    if (getUnsavedRating()) {
      const ok = window.confirm(
        "You have unsaved rating changes. Sign out anyway? Your input will be discarded."
      );
      if (!ok) return;
    }
    await signOut({ callbackUrl: "/" });
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/apartments" className="flex min-h-11 items-center sm:min-h-0">
          <Image
            src="/flatpare_logo.svg"
            alt="Flatpare"
            width={120}
            height={37}
            className="h-8 w-auto dark:invert"
            priority
          />
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                pathname === item.href
                  ? "bg-accent font-medium"
                  : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-h-11 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:min-h-0">
              <User className="h-3.5 w-3.5" />
              <span>{userName}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background sm:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center py-3 text-center text-xs transition-colors",
              pathname === item.href
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
