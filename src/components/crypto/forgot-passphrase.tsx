"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-context";
import { runRecover, runResetKeys } from "./flows";
import { MIN_PASSPHRASE_LENGTH } from "./setup-screen";
import { useFlowErrorText } from "./use-flow-error-text";

type Mode = "closed" | "menu" | "reset" | "recover";

type Problem = "tooShort" | "mismatch";

function validateNew(passphrase: string, confirm: string): Problem | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return "tooShort";
  if (passphrase !== confirm) return "mismatch";
  return null;
}

function NewPassphraseFields({
  passphrase,
  confirm,
  onPassphrase,
  onConfirm,
}: {
  passphrase: string;
  confirm: string;
  onPassphrase: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  const t = useTranslations("crypto");
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="forgot-new">{t("passphrase.new")}</Label>
        <Input
          weight="frame"
          id="forgot-new"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => onPassphrase(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="forgot-confirm">{t("passphrase.confirmNew")}</Label>
        <Input
          weight="frame"
          id="forgot-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
        />
      </div>
    </>
  );
}

export function ForgotPassphrase() {
  const t = useTranslations("crypto");
  const tc = useTranslations("common");
  const errorText = useFlowErrorText();
  const { status, refresh, showRecoveryKit } = useCrypto();
  const [mode, setMode] = useState<Mode>("closed");
  const [code, setCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasKit = Boolean(status?.recovery);
  // A reset only helps if somebody else holds the data key and can re-wrap it
  // to the new public key. For a sole key holder a reset is a one-way trip
  // into pending-wrap with nobody to wait for, so it is not offered at all.
  const canReset = Boolean(status?.othersHaveWraps);
  const menuIntro = !canReset ? t("forgot.cannotReset") : hasKit ? t("forgot.startOverOrKit") : t("forgot.startOver");
  const problemText = (p: Problem) =>
    p === "tooShort" ? t("passphrase.tooShort", { min: MIN_PASSPHRASE_LENGTH }) : t("passphrase.mismatch");

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    const problem = validateNew(passphrase, confirm);
    if (problem) return setError(problemText(problem));
    setError(null);
    setBusy(true);
    try {
      await runResetKeys(status, passphrase);
      await refresh();
    } catch (err) {
      setError(errorText(err, "forgot.reset.failed"));
      setBusy(false);
    }
  }

  async function submitRecover(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    const problem = validateNew(passphrase, confirm);
    if (problem) return setError(problemText(problem));
    setError(null);
    setBusy(true);
    try {
      const { recoveryCode } = await runRecover(status, code, passphrase);
      setDone(t("forgot.recover.done"));
      showRecoveryKit(recoveryCode);
      await refresh();
    } catch (err) {
      setError(errorText(err, "forgot.recover.failed"));
      setBusy(false);
    }
  }

  if (mode === "closed") {
    return (
      <button type="button" className="text-sm underline" onClick={() => setMode("menu")}>
        {t("forgot.open")}
      </button>
    );
  }

  if (mode === "menu") {
    return (
      <div className="space-y-3 rounded-md border p-4">
        <p className="text-sm text-muted-foreground">{menuIntro}</p>
        {!canReset && <p className="text-sm text-muted-foreground">{t("forgot.soleHolder")}</p>}
        <div className="flex flex-wrap gap-2">
          {canReset && (
            <Button type="button" variant="outline" onClick={() => setMode("reset")}>
              {t("forgot.resetButton")}
            </Button>
          )}
          {hasKit && (
            <Button type="button" variant="outline" onClick={() => setMode("recover")}>
              {t("forgot.useKitButton")}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setMode("closed")}>
            {tc("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <form onSubmit={submitReset} className="space-y-4 rounded-md border p-4">
        <h2 className="title-section">{t("forgot.reset.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("forgot.reset.intro")}</p>
        <NewPassphraseFields
          passphrase={passphrase}
          confirm={confirm}
          onPassphrase={setPassphrase}
          onConfirm={setConfirm}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("forgot.reset.submitting") : t("forgot.reset.submit")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("menu")}>
            {tc("back")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitRecover} className="space-y-4 rounded-md border p-4">
      <h2 className="title-section">{t("forgot.recover.title")}</h2>
      <div className="space-y-1">
        <Label htmlFor="forgot-code">{t("forgot.recover.code")}</Label>
        <Input
          weight="frame"
          id="forgot-code"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <NewPassphraseFields
        passphrase={passphrase}
        confirm={confirm}
        onPassphrase={setPassphrase}
        onConfirm={setConfirm}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm">{done}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("forgot.recover.submitting") : t("forgot.recover.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("menu")}>
          {tc("back")}
        </Button>
      </div>
    </form>
  );
}
