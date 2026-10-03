"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useIsClient } from "./use-is-client";

// One button that flips light and dark (#301). It drives the same
// next-themes provider as the app's own toggle, so the choice carries over
// after sign-in; until the visitor presses it, the system preference rules.
export function LandingThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid size-11 shrink-0 cursor-pointer place-items-center border-[3px] border-(--lp-chip-line) bg-(--lp-surface) text-(--lp-ink) shadow-(--lp-btn-shadow)"
    >
      {isDark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}
