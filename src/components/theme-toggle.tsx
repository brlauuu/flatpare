"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

// Returns false during SSR and the first client render, true thereafter.
// Using useSyncExternalStore avoids the setState-in-effect anti-pattern
// of the older `useEffect(() => setMounted(true), [])` idiom.
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

// One button that flips light and dark, on the landing page and in the app
// alike (#335). Until it is pressed the system preference rules
// (`defaultTheme="system"` in theme-provider.tsx); a press stores an
// explicit choice. The resolved theme is unknown before hydration, so the
// button renders as "light" until then — same size either way, no shift.
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "grid size-11 shrink-0 cursor-pointer place-items-center border-[3px] border-frame bg-card text-foreground shadow-button",
        className
      )}
    >
      {isDark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}
