"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";
import { runRecover, runResetKeys } from "./flows";
import { MIN_PASSPHRASE_LENGTH } from "./setup-screen";

type Mode = "closed" | "menu" | "reset" | "recover";

function validateNew(passphrase: string, confirm: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  }
  if (passphrase !== confirm) return "The passphrases do not match.";
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
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="forgot-new">New passphrase</Label>
        <Input
          id="forgot-new"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => onPassphrase(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="forgot-confirm">Confirm new passphrase</Label>
        <Input
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

function menuIntro(canReset: boolean, hasKit: boolean): string {
  if (!canReset) return "Flatpare cannot reset your passphrase.";
  const kit = hasKit ? ", or use your recovery kit" : "";
  return (
    "Flatpare cannot reset your passphrase. You can start over with new keys " +
    `and be let back in by someone in your household${kit}.`
  );
}

export function ForgotPassphrase() {
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

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    const problem = validateNew(passphrase, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      await runResetKeys(status, passphrase);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
      setBusy(false);
    }
  }

  async function submitRecover(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    const problem = validateNew(passphrase, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const { recoveryCode } = await runRecover(status, code, passphrase);
      setDone("Recovered. Your old recovery kit no longer works — here is the new one.");
      showRecoveryKit(recoveryCode);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
      setBusy(false);
    }
  }

  if (mode === "closed") {
    return (
      <button type="button" className="text-sm underline" onClick={() => setMode("menu")}>
        Forgot your passphrase?
      </button>
    );
  }

  if (mode === "menu") {
    return (
      <div className="space-y-3 rounded-md border p-4">
        <p className="text-sm text-muted-foreground">{menuIntro(canReset, hasKit)}</p>
        {!canReset && (
          <p className="text-sm text-muted-foreground">
            Nobody else in your household holds the key, so a reset could not
            be completed — use your recovery kit.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canReset && (
            <Button type="button" variant="outline" onClick={() => setMode("reset")}>
              Reset my keys
            </Button>
          )}
          {hasKit && (
            <Button type="button" variant="outline" onClick={() => setMode("recover")}>
              Use my recovery kit
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setMode("closed")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <form onSubmit={submitReset} className="space-y-4 rounded-md border p-4">
        <h2 className="font-semibold">Reset my keys</h2>
        <p className="text-sm text-muted-foreground">
          You will get new keys under a new passphrase and wait for someone in
          your household to open Flatpare. If you are the only member, use your
          recovery kit instead — a reset alone cannot bring the data back.
        </p>
        <NewPassphraseFields
          passphrase={passphrase}
          confirm={confirm}
          onPassphrase={setPassphrase}
          onConfirm={setConfirm}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Resetting…" : "Reset and wait"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("menu")}>
            Back
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitRecover} className="space-y-4 rounded-md border p-4">
      <h2 className="font-semibold">Use my recovery kit</h2>
      <div className="space-y-1">
        <Label htmlFor="forgot-code">Recovery code</Label>
        <Input
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
          {busy ? "Recovering…" : "Recover"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("menu")}>
          Back
        </Button>
      </div>
    </form>
  );
}
