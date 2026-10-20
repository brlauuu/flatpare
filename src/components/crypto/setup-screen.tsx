"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-context";
import { useFlowErrorText } from "./use-flow-error-text";

export const MIN_PASSPHRASE_LENGTH = 12;

export function SetupScreen() {
  const t = useTranslations("crypto");
  const errorText = useFlowErrorText();
  const { status, setup } = useCrypto();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creator = status?.role === "owner" && !status.householdHasWraps;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(t("passphrase.tooShort", { min: MIN_PASSPHRASE_LENGTH }));
      return;
    }
    if (passphrase !== confirm) {
      setError(t("passphrase.mismatch"));
      return;
    }
    setBusy(true);
    try {
      await setup(passphrase);
    } catch (err) {
      setError(errorText(err, "setup.failed"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="title-page">{t("setup.title")}</h1>
      <p className="text-sm text-muted-foreground">
        {creator ? t("setup.introCreator") : t("setup.introJoiner")}
      </p>
      <div className="space-y-1">
        <Label htmlFor="setup-passphrase">{t("passphrase.label")}</Label>
        <Input
          weight="frame"
          id="setup-passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="setup-confirm">{t("passphrase.confirm")}</Label>
        <Input
          weight="frame"
          id="setup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? t("setup.submitting") : t("setup.submit")}
      </Button>
    </form>
  );
}
