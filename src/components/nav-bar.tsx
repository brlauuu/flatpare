"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChevronDown, Plus, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/apartments", label: "Apartments" },
  { href: "/apartments/new", label: "Upload" },
  { href: "/compare", label: "Compare" },
  { href: "/costs", label: "Costs" },
  { href: "/guide", label: "Guide" },
];

export function NavBar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [users, setUsers] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/auth/users")
      .then((res) => res.json())
      .then((data: string[]) => setUsers(data))
      .catch(() => {});
  }, []);

  async function switchUser(name: string) {
    await fetch("/api/auth/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    router.refresh();
  }

  const otherUsers = users.filter((u) => u !== userName);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/apartments" className="flex items-center">
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
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <User className="h-3.5 w-3.5" />
              <span>{userName}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
              <DropdownMenuLabel>Switch user</DropdownMenuLabel>
              {otherUsers.map((name) => (
                <DropdownMenuItem key={name} onSelect={() => switchUser(name)}>
                  {name}
                </DropdownMenuItem>
              ))}
              {otherUsers.length === 0 && (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">No other users</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/")}>
                <Plus className="h-3.5 w-3.5" />
                Add new user
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
              "flex-1 py-3 text-center text-xs transition-colors",
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
