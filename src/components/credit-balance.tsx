"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useHouseholdData } from "@/components/household-data/use-household-data";

// At or below this many credits the number turns orange; at zero, red.
export const LOW_CREDITS = 5;

// The household's remaining apartment credits, shown to every member (#305).
//
// Credits are one shared pool (#294), so one member's additions change what
// everyone has left, and until this existed the first sign of running out was
// the refusal itself.
//
// Renders NOTHING when billing is off: `credits` is null then, and a
// self-hoster must not see a quota that does not exist.
//
// The wording says "to add" on purpose. This counts apartments ever ADDED,
// which is a different number from the "N of 40" held-at-once counter that
// can sit right beside it.
export function CreditBalance({ className }: { className?: string }) {
  const { credits } = useHouseholdData();
  if (!credits) return null;

  const { remaining } = credits;
  const level = remaining === 0 ? "empty" : remaining <= LOW_CREDITS ? "low" : "ok";

  return (
    <p className={cn("text-sm text-muted-foreground", className)} data-testid="credit-balance">
      <span
        data-level={level}
        className={cn(
          "font-medium tabular-nums",
          level === "ok" && "text-foreground",
          level === "low" && "text-orange-600 dark:text-orange-400",
          level === "empty" && "text-destructive"
        )}
      >
        {remaining}
      </span>{" "}
      {remaining === 1 ? "apartment" : "apartments"} left to add
      {/* Colour alone does not reach everyone. */}
      {level === "low" && <span className="sr-only"> (running low)</span>}
      {level === "empty" && <span className="sr-only"> (none left)</span>}
      {" · "}
      <Link href="/billing" className="underline underline-offset-2 hover:text-foreground">
        Buy more
      </Link>
    </p>
  );
}
