"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useCrypto } from "./crypto-context";
import { useFlowErrorText } from "./use-flow-error-text";

// Shown to an owner whose household has no data key yet while they already
// have a key pair (#220): they left, or were removed from, another household
// and now own a fresh one. One click creates the key and the recovery kit.
export function HouseholdKeyScreen() {
  const t = useTranslations("crypto");
  const errorText = useFlowErrorText();
  const { createHouseholdKey } = useCrypto();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await createHouseholdKey();
    } catch (err) {
      setError(errorText(err, "householdKey.failed"));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="title-page">{t("householdKey.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("householdKey.intro")}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={busy} onClick={() => void create()}>
        {busy ? t("householdKey.submitting") : t("householdKey.submit")}
      </Button>
    </div>
  );
}
