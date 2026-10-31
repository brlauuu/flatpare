import Link from "next/link";
import { redirect } from "next/navigation";
import { readOperator } from "@/lib/operator";
import { feedbackEnabled } from "@/lib/feedback";
import { getTranslations } from "next-intl/server";
import { NavBar } from "@/components/nav-bar";
import { resolveHouseholdIdentity } from "@/lib/session";
import { readCreditBalance } from "@/lib/billing";
import { CheckoutPanel } from "./checkout-panel";

// Where a household that has never purchased lands (src/lib/billing-gate.ts),
// and where "Buy more" takes one that has (#305).
//
// Deliberately outside the four signed-in layouts: those mount CryptoGate and
// the household data store, neither of which is needed to buy something, and
// one of which would gate this page behind unlocking a key the user may not
// have set up yet.
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const identity = await resolveHouseholdIdentity();
  if (!identity) redirect("/");

  const balance = await readCreditBalance(identity.householdId);
  // Nothing to sell when billing is off (self-hosted). A household that
  // already owns credits is welcome: topping up is the `returning` copy below.
  if (!balance.enabled) redirect("/apartments");

  const returning = balance.granted > 0;
  const t = await getTranslations("billing.page");
  const operator = readOperator() !== null;

  return (
    <>
      <NavBar userName={identity.userName} terms={operator} feedback={feedbackEnabled()} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
        <div className="space-y-3">
          <h1 className="title-page">
            {returning ? t("titleReturning") : t("titleFirst")}
          </h1>
          {returning ? (
            <p className="text-muted-foreground text-pretty">
              {t("usage", { used: balance.used, granted: balance.granted })}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-pretty">{t("pitch")}</p>
              <p className="text-sm text-muted-foreground text-pretty">
                {t.rich("quota", { strong: (chunks) => <strong>{chunks}</strong> })}
              </p>
            </>
          )}
        </div>

        <CheckoutPanel grantedAtStart={balance.granted} />

        <p className="text-xs text-muted-foreground text-pretty">{t("stripe")}</p>
        {operator && (
          <p className="text-xs text-muted-foreground text-pretty">
            {t.rich("terms", {
              link: (chunks) => (
                <Link href="/terms" className="text-primary underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}
      </main>
    </>
  );
}
