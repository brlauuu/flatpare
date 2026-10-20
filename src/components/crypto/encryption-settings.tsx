"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-context";
import { runChangePassphrase, runRegenerateRecovery } from "./flows";
import { MIN_PASSPHRASE_LENGTH } from "./setup-screen";
import { useFlowErrorText } from "./use-flow-error-text";

export function EncryptionSettings() {
  const t = useTranslations("crypto");
  const errorText = useFlowErrorText();
  const { state, status, keys, lock, refresh, showRecoveryKit } = useCrypto();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state === "off" || !status) {
    return (
      <section className="space-y-2">
        <h2 className="title-section">{t("settings.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.off")}</p>
      </section>
    );
  }

  async function changePassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    setError(null);
    setMessage(null);
    if (next.length < MIN_PASSPHRASE_LENGTH) {
      return setError(t("passphrase.tooShort", { min: MIN_PASSPHRASE_LENGTH }));
    }
    if (next !== confirm) return setError(t("passphrase.mismatch"));
    setBusy(true);
    try {
      await runChangePassphrase(status, current, next);
      await refresh();
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage(t("settings.changed"));
    } catch (err) {
      setError(errorText(err, "settings.changeFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!status || !keys) return;
    setError(null);
    setBusy(true);
    try {
      const { recoveryCode } = await runRegenerateRecovery(status, keys);
      await refresh();
      showRecoveryKit(recoveryCode);
    } catch (err) {
      setError(errorText(err, "settings.regenerateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="title-section">{t("settings.title")}</h2>

      <form onSubmit={changePassphrase} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="enc-current">{t("passphrase.current")}</Label>
          <Input
            id="enc-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="enc-next">{t("passphrase.new")}</Label>
          <Input
            id="enc-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="enc-confirm">{t("passphrase.confirmNew")}</Label>
          <Input
            id="enc-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm">{message}</p>}
        <Button type="submit" disabled={busy}>
          {t("settings.change")}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void lock()}>
          {t("settings.lock")}
        </Button>
        {status.role === "owner" && (
          <Button type="button" variant="outline" disabled={busy} onClick={regenerate}>
            {t("settings.regenerate")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("settings.explain")}</p>
    </section>
  );
}
