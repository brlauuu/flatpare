"use client";

import { useTranslations } from "next-intl";
import { CreditBalance } from "@/components/credit-balance";
import { RedeemCreditCode } from "@/components/redeem-credit-code";
import { useHouseholdData } from "@/components/household-data/use-household-data";

// The household's credits as a section of their own on the Household page:
// the balance, buying more, and redeeming a code. They used to sit under
// Members, where they read as part of the member list. Every member sees and
// uses all of it, since credits are one shared pool (#294).
//
// Renders nothing where credits are not counted: a self-hoster must not see a
// quota that does not exist.
export function HouseholdCredits() {
  const t = useTranslations("household.credits");
  const { credits } = useHouseholdData();
  if (!credits) return null;

  return (
    <section className="space-y-4" aria-labelledby="household-credits-title">
      <h2 id="household-credits-title" className="title-section">
        {t("title")}
      </h2>
      <CreditBalance />
      <RedeemCreditCode />
    </section>
  );
}
