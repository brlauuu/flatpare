"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const themes = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
] as const;

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

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsClient();

  if (!mounted) {
    // Must match the rendered toggle at both breakpoints, or every mobile
    // page load shifts when the real control replaces it.
    return <div className="h-11 w-32 sm:h-8 sm:w-20" />;
  }

  return (
    <div className="flex items-center rounded-md border bg-muted p-0.5">
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={`Switch to ${label} theme`}
          className={cn(
            "flex min-h-11 min-w-11 items-center justify-center rounded-sm p-2.5 transition-colors sm:min-h-0 sm:min-w-0 sm:p-1",
            theme === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
