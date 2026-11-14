"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useHouseholdData } from "@/components/household-data/use-household-data";

// At or below this many credits the number turns orange; at zero, red.
export const LOW_CREDITS = 5;

// Where a credit code is redeemed (#492): the form on the Household page.
export const REDEEM_HREF = "/household#redeem-code";

// The household's remaining apartment credits, shown to every member (#305).
//
// Credits are one shared pool (#294), so one member's additions change what
// everyone has left, and until this existed the first sign of running out was
// the refusal itself.
//
// Renders NOTHING when billing is off: `credits` is null then, and a
// self-hoster must not see a quota that does not exist.
//
// The wording says "to process" on purpose (#413). This counts processings
// paid for, which is a different number from the "N of 40" held-at-once
// counter that can sit right beside it.
export function CreditBalance({ className }: { className?: string }) {
  const t = useTranslations("apartments.credits");
  const { credits } = useHouseholdData();
  if (!credits) return null;

  const { remaining } = credits;
  const level = remaining === 0 ? "empty" : remaining <= LOW_CREDITS ? "low" : "ok";

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground", className)}
      data-testid="credit-balance"
    >
      <span>
        {t.rich("left", {
          count: remaining,
          n: (chunks) => (
            <span
              data-level={level}
              className={cn(
                "font-mono font-medium tabular-nums",
                level === "ok" && "text-foreground",
                level === "low" && "text-warning",
                level === "empty" && "text-destructive"
              )}
            >
              {chunks}
            </span>
          ),
        })}
        {/* Colour alone does not reach everyone. */}
        {level === "low" && <span className="sr-only"> {t("runningLow")}</span>}
        {level === "empty" && <span className="sr-only"> {t("noneLeft")}</span>}
      </span>
      {/* No checkout while credits are counted without Stripe (#492): more
          come from a code, redeemed on the Household page. */}
      <Link
        href={credits.purchasable ? "/billing" : REDEEM_HREF}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        {credits.purchasable ? t("buyMore") : t("redeem")}
      </Link>
    </div>
  );
}
