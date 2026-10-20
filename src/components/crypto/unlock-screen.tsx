"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-context";
import { useFlowErrorText } from "./use-flow-error-text";

export function UnlockScreen({ extra }: { extra?: React.ReactNode }) {
  const t = useTranslations("crypto");
  const errorText = useFlowErrorText();
  const { unlock, persistent } = useCrypto();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unlock(passphrase);
    } catch (err) {
      setError(errorText(err, "unlock.failed"));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <h1 className="title-page">{t("unlock.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("unlock.intro")}</p>
        {!persistent && <p className="text-sm text-muted-foreground">{t("unlock.notPersistent")}</p>}
        <div className="space-y-1">
          <Label htmlFor="unlock-passphrase">{t("passphrase.label")}</Label>
          <Input
            weight="frame"
            id="unlock-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || passphrase.length === 0}>
          {busy ? t("unlock.submitting") : t("unlock.submit")}
        </Button>
      </form>
      {extra}
    </div>
  );
}
