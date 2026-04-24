"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getUnsavedRating } from "@/lib/unsaved-changes";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChevronDown, Plus, User, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
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
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function switchUser(name: string) {
    if (name === userName) return;
    if (getUnsavedRating()) {
      const ok = window.confirm(
        "You have unsaved rating changes. Switch user anyway? Your input will be discarded."
      );
      if (!ok) return;
    }
    await fetch("/api/auth/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });
    window.dispatchEvent(new Event("flatpare-user-changed"));
    router.refresh();
  }

  async function deleteUser(name: string) {
    if (name === userName && getUnsavedRating()) {
      const ok = window.confirm(
        "You have unsaved rating changes. Delete yourself anyway? Your input will be discarded."
      );
      if (!ok) return;
    }
    const res = await fetch(
      `/api/auth/users/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { switchedTo?: string | null };
    if (data.switchedTo !== undefined) {
      window.dispatchEvent(new Event("flatpare-user-changed"));
    }
    if (data.switchedTo === null) {
      router.push("/");
    } else {
      router.refresh();
    }
  }

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
              <DropdownMenuGroup>
                <DropdownMenuLabel>Users</DropdownMenuLabel>
                {users.map((name) => (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => switchUser(name)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span
                      className={cn(
                        "flex-1",
                        name === userName && "font-medium"
                      )}
                    >
                      {name}
                      {name === userName && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete ${name}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteUser(name);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
                {users.length === 0 && (
                  <DropdownMenuItem disabled>
                    <span className="text-muted-foreground">No users</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/add-user")}>
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
