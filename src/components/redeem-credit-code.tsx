"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHouseholdData } from "@/components/household-data/use-household-data";

// Redeems a credit code from the operator (#492), for any member: credits are
// one shared pool (#294). Shown wherever credits are counted, so it stays
// after launch for gifts and make-goods; renders nothing on a deployment that
// does not count them. The balance link elsewhere points here
// (`/household#redeem-code`).
export function RedeemCreditCode() {
  const t = useTranslations("household.redeem");
  const { credits, redeemCreditCode } = useHouseholdData();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  if (!credits) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const added = await redeemCreditCode(code);
      setCode("");
      setResult({ ok: true, text: t("added", { count: added }) });
    } catch (err) {
      // Server-sent text is shown as sent; it never repeats the code.
      setResult({ ok: false, text: err instanceof Error ? err.message : t("failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="redeem-code" onSubmit={submit} className="scroll-mt-24 space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="redeem-code-input">{t("label")}</Label>
          <Input
            id="redeem-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy || code.trim().length === 0}>
          {t("submit")}
        </Button>
      </div>
      {result ? (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {result.text}
        </p>
      ) : (
        !credits.purchasable && <p className="text-sm text-muted-foreground">{t("hint")}</p>
      )}
    </form>
  );
}
